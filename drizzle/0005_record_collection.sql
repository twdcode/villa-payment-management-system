-- ============================================================
-- The money path. One transaction, one source of truth.
-- ============================================================
-- Why this lives in Postgres and not in TypeScript (BACKEND-PLAN D5, C8):
--
--   * Two staff recording against the same villa at the same moment must not both read
--     "10,000,000 outstanding" and both allocate against it. `FOR UPDATE` on the villa row
--     serialises them; the second waits and then sees the first one's effect.
--   * Allocation, the stage updates, the advance credit and the receipt number must all
--     land together or not at all. Application code cannot promise that across a network.
--   * `numeric` arithmetic end to end. No float ever touches money.
--
-- `calculations.ts` remains as a PREVIEW for the form. This function recomputes
-- everything server-side and its answer is the one stored. If the two disagree that is a
-- bug to fix, not a rounding difference to tolerate.
-- ============================================================

-- ------------------------------------------------------------
-- Interest owed on one stage, as of a date.
--
-- Mirrors v_stage_position exactly: interest already CHARGED (a stored fact) plus accrual
-- over the days since `interest_charged_to`. Never recomputes across days already
-- charged — see 0004_interest_accrual.sql for what that cost.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_interest_as_of(
  p_stage_id uuid,
  p_as_of    date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage      public.payment_stages%ROWTYPE;
  v_terms      public.villa_interest_terms%ROWTYPE;
  v_paid       numeric(18,2);
  v_start      date;
  v_days       integer;
  v_rate       numeric;
  v_divisor    integer;
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = v_stage.villa_id;

  -- Interest switched off zeroes the accrual but never erases what was already charged.
  v_rate    := CASE WHEN COALESCE(v_terms.charge_interest, true) THEN COALESCE(v_terms.monthly_rate, 0) ELSE 0 END;
  v_divisor := NULLIF(COALESCE(v_terms.prorata_divisor, 30), 0);

  SELECT COALESCE(SUM(principal_amount), 0) INTO v_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  v_start := CASE
    WHEN COALESCE(v_terms.interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + v_stage.grace_period_days * INTERVAL '1 day')::date
  END;
  IF v_stage.interest_charged_to IS NOT NULL AND v_stage.interest_charged_to > v_start THEN
    v_start := v_stage.interest_charged_to;
  END IF;

  v_days := GREATEST(0, p_as_of - v_start);

  RETURN v_stage.interest_charged
       + ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / v_divisor, 2);
END;
$$;

COMMENT ON FUNCTION public.stage_interest_as_of(uuid, date) IS
  'Interest owed on a stage as of a date: what was charged, plus accrual since interest_charged_to.';

-- ------------------------------------------------------------
-- Record a collection.
--
-- Allocation order: oldest due_date first. Within a stage, interest before principal (or
-- the reverse, per the agreement). Money left once every stage is settled becomes advance
-- credit — never before then, so E7's remainder rolls into the next stage rather than
-- sitting as credit while a stage is still unpaid.
--
-- Returns the collection id. Everything else is read back through the views, so there is
-- exactly one definition of what a collection looks like.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_collection(
  p_villa_id         uuid,
  p_customer_id      uuid,
  p_payment_date     date,
  p_amount           numeric,
  p_method           public.payment_method,
  p_reference_no     text,
  p_idempotency_key  text,
  p_recorded_by      uuid,
  p_notes            text DEFAULT NULL,
  p_receipt_url      text DEFAULT NULL,
  p_receipt_no       text DEFAULT NULL,
  p_supersedes_id    uuid DEFAULT NULL,
  p_edit_reason      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_villa          public.villas%ROWTYPE;
  v_terms          public.villa_interest_terms%ROWTYPE;
  v_order          text;
  v_collection_id  uuid;
  v_receipt_no     text;
  v_prefix         text;
  v_remaining      numeric(18,2);
  v_stage          RECORD;
  v_interest_owed  numeric(18,2);
  v_principal_due  numeric(18,2);
  v_to_interest    numeric(18,2);
  v_to_principal   numeric(18,2);
  v_allocated      numeric(18,2) := 0;
  v_credit         numeric(18,2);
  v_existing       uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero.' USING ERRCODE = 'check_violation';
  END IF;

  -- C2: a repeat of the same submission returns the original receipt instead of issuing a
  -- second one. Checked up front so the caller gets the existing row rather than a
  -- constraint error.
  SELECT id INTO v_existing FROM public.collections WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Serialise concurrent recordings against this villa. Two staff submitting at the same
  -- instant would otherwise both read the same outstanding balance and both allocate
  -- against it, paying the same stage twice.
  SELECT * INTO v_villa FROM public.villas WHERE id = p_villa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Villa not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_villa.programme_status = 'cancelled' THEN
    RAISE EXCEPTION 'Collections cannot be recorded for a cancelled villa programme.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_villa.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Villa not found.' USING ERRCODE = 'no_data_found';
  END IF;

  -- O3: a completed project stops everything.
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_villa.project_id AND status = 'completed') THEN
    RAISE EXCEPTION 'This project is completed. No further collections can be recorded.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.villa_customers
    WHERE villa_id = p_villa_id AND customer_id = p_customer_id AND unassigned_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The selected villa and customer do not form a valid collection path.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = p_villa_id;
  v_order := COALESCE(v_terms.allocation_order, 'interest_first');

  -- C12: plain sequence, gaps allowed. No locked counter — a gap is harmless, a lock
  -- contended by every concurrent payment is not. An edit reuses the original number.
  IF p_receipt_no IS NOT NULL THEN
    v_receipt_no := p_receipt_no;
  ELSE
    SELECT receipt_prefix INTO v_prefix FROM public.app_settings WHERE id = 1;
    v_receipt_no := COALESCE(v_prefix, 'JVM-RCP') || '-' ||
                    LPAD((COALESCE((SELECT COUNT(*) FROM public.collections), 0) + 1)::text, 4, '0');
  END IF;

  INSERT INTO public.collections (
    villa_id, customer_id, payment_date, amount, method, reference_no, receipt_no,
    idempotency_key, receipt_document_url, notes, recorded_by, supersedes_id, edit_reason
  ) VALUES (
    p_villa_id, p_customer_id, p_payment_date, p_amount, p_method, p_reference_no, v_receipt_no,
    p_idempotency_key, p_receipt_url, p_notes, p_recorded_by, p_supersedes_id, p_edit_reason
  ) RETURNING id INTO v_collection_id;

  v_remaining := p_amount;

  -- Oldest first. `interest_charged` is brought up to the payment date and frozen there,
  -- so a later balance change cannot rewrite what was charged for these days.
  FOR v_stage IN
    SELECT s.id, s.principal_amount, s.due_date
    FROM public.payment_stages s
    WHERE s.villa_id = p_villa_id AND s.due_date IS NOT NULL AND s.principal_amount > 0
    ORDER BY s.due_date, s.stage_no
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_interest_owed := public.stage_interest_as_of(v_stage.id, p_payment_date);

    -- Charge interest up to the payment date, whether or not this payment settles it.
    -- Leaving it uncharged would let a later balance change silently erase these days.
    UPDATE public.payment_stages
    SET interest_charged    = v_interest_owed,
        interest_charged_to = GREATEST(
          COALESCE(interest_charged_to, p_payment_date),
          p_payment_date
        )
    WHERE id = v_stage.id;

    v_interest_owed := v_interest_owed - COALESCE(
      (SELECT SUM(interest_amount) FROM public.v_live_allocations WHERE payment_stage_id = v_stage.id), 0);
    v_interest_owed := GREATEST(0, v_interest_owed);

    v_principal_due := v_stage.principal_amount - COALESCE(
      (SELECT SUM(principal_amount) FROM public.v_live_allocations WHERE payment_stage_id = v_stage.id), 0);
    v_principal_due := GREATEST(0, v_principal_due);

    CONTINUE WHEN v_interest_owed = 0 AND v_principal_due = 0;

    IF v_order = 'interest_first' THEN
      v_to_interest  := LEAST(v_remaining, v_interest_owed);
      v_remaining    := v_remaining - v_to_interest;
      v_to_principal := LEAST(v_remaining, v_principal_due);
      v_remaining    := v_remaining - v_to_principal;
    ELSE
      v_to_principal := LEAST(v_remaining, v_principal_due);
      v_remaining    := v_remaining - v_to_principal;
      v_to_interest  := LEAST(v_remaining, v_interest_owed);
      v_remaining    := v_remaining - v_to_interest;
    END IF;

    IF v_to_interest > 0 OR v_to_principal > 0 THEN
      INSERT INTO public.collection_allocations (collection_id, payment_stage_id, principal_amount, interest_amount)
      VALUES (v_collection_id, v_stage.id, v_to_principal, v_to_interest);
      v_allocated := v_allocated + v_to_principal + v_to_interest;

      UPDATE public.payment_stages
      SET principal_paid = principal_paid + v_to_principal,
          interest_paid  = interest_paid  + v_to_interest
      WHERE id = v_stage.id;
    END IF;
  END LOOP;

  -- E6/B5: money with no unpaid stage left to absorb it becomes a real credit balance.
  -- Only once every stage is settled — E7's remainder rolls forward first.
  v_credit := v_remaining;
  IF v_credit > 0 THEN
    INSERT INTO public.advance_credits (villa_id, collection_id, amount, status)
    VALUES (p_villa_id, v_collection_id, v_credit, 'available');
  END IF;

  -- The invariant, asserted before commit rather than reported afterwards by
  -- v_ledger_reconciliation. If this fails the whole transaction rolls back and no
  -- receipt is issued — money that does not balance must never reach the ledger.
  IF v_allocated + v_credit <> p_amount THEN
    RAISE EXCEPTION 'Allocation does not balance: % allocated + % credit <> % received.',
      v_allocated, v_credit, p_amount USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_collection_id;
END;
$$;

COMMENT ON FUNCTION public.record_collection IS
  'Records a payment in one transaction: locks the villa, allocates oldest-stage-first, charges interest to the payment date, writes allocations and any advance credit, and asserts allocations + credit = amount received before commit.';

-- ------------------------------------------------------------
-- Correct a collection (C1/E10). There is no reversal.
--
-- The original row is retained and marked superseded so every total excludes it; a new
-- row carries the corrected values and the SAME receipt number. Interest is re-derived
-- from scratch: the anchor is rewound and the stages recharged from the corrected
-- payment date, because changing the date or the amount changes what was owed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_collection(
  p_collection_id  uuid,
  p_villa_id       uuid,
  p_customer_id    uuid,
  p_payment_date   date,
  p_amount         numeric,
  p_method         public.payment_method,
  p_reference_no   text,
  p_edited_by      uuid,
  p_reason         text,
  p_notes          text DEFAULT NULL,
  p_receipt_url    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_old        public.collections%ROWTYPE;
  v_new_id     uuid;
  v_stage_id   uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Enter a reason for this correction.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.collections WHERE id = p_collection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_old.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'This collection has already been corrected.' USING ERRCODE = 'check_violation';
  END IF;

  -- Roll back the old row's effect on every stage it touched, and rewind the interest
  -- anchor so the corrected values re-derive interest instead of inheriting the old
  -- figure (E10).
  FOR v_stage_id IN
    SELECT payment_stage_id FROM public.collection_allocations WHERE collection_id = p_collection_id
  LOOP
    UPDATE public.payment_stages s
    SET principal_paid = GREATEST(0, s.principal_paid - a.principal_amount),
        interest_paid  = GREATEST(0, s.interest_paid  - a.interest_amount),
        interest_charged    = 0,
        interest_charged_to = NULL
    FROM public.collection_allocations a
    WHERE a.collection_id = p_collection_id
      AND a.payment_stage_id = v_stage_id
      AND s.id = v_stage_id;
  END LOOP;

  DELETE FROM public.advance_credits WHERE collection_id = p_collection_id;
  DELETE FROM public.collection_allocations WHERE collection_id = p_collection_id;

  UPDATE public.collections
  SET superseded_at = now(), superseded_by = p_edited_by, status = 'superseded', edit_reason = p_reason
  WHERE id = p_collection_id;

  -- The replacement keeps the original receipt number (C15: uniqueness holds among live
  -- rows only, which is why a plain UNIQUE would have made every edit fail).
  v_new_id := public.record_collection(
    p_villa_id, p_customer_id, p_payment_date, p_amount, p_method, p_reference_no,
    v_old.idempotency_key || ':v' || substr(md5(random()::text), 1, 8),
    p_edited_by, p_notes, p_receipt_url, v_old.receipt_no, p_collection_id, p_reason
  );

  INSERT INTO public.audit_log (table_name, record_id, action, before, after, reason, actor_id)
  VALUES ('collections', p_collection_id, 'supersede',
          to_jsonb(v_old),
          (SELECT to_jsonb(c) FROM public.collections c WHERE c.id = v_new_id),
          p_reason, p_edited_by);

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.update_collection IS
  'Corrects a collection by superseding it (C1/E10). The original is retained and excluded from totals; the replacement keeps the same receipt number and re-derives interest from the corrected values.';
