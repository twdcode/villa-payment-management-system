-- ============================================================
-- Block overpayment instead of banking it as advance credit.
-- ============================================================
-- `record_collection()` used to let any amount through and quietly park whatever was left
-- over as an `advance_credits` row once every stage was settled. The company's decision:
-- an amount beyond what the villa currently owes should be refused at entry, not banked.
-- Overpaying should surface immediately as something to fix — a mistyped figure, or money
-- that belongs to a stage that has not been added to the schedule yet — not disappear into
-- a credit balance someone has to notice and remember to refund.
--
-- The room available is what the villa currently owes across every existing stage
-- (principal + interest, as of the payment date), computed the same way
-- `calculateVillaFinancials()` does client-side, so the two agree.
--
-- This function is the single choke point: `update_collection()` calls it internally
-- after unwinding the collection being corrected, so one guard here covers both a new
-- payment and a correction — a correction's own old amount is already backed out of the
-- stages by the time this check runs, exactly matching what the client computed as
-- `maxPayable`.
-- ============================================================

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
  v_villa           public.villas%ROWTYPE;
  v_terms           public.villa_interest_terms%ROWTYPE;
  v_order           public.allocation_order;
  v_existing        uuid;
  v_collection_id   uuid;
  v_receipt_no      text;
  v_prefix          text;
  v_stage           RECORD;
  v_remaining       numeric(18,2);
  v_allocated       numeric(18,2) := 0;
  v_credit          numeric(18,2);
  v_interest_owed   numeric(18,2);
  v_principal_due   numeric(18,2);
  v_to_interest     numeric(18,2);
  v_to_principal    numeric(18,2);
  v_total_owed      numeric(18,2);
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.collections WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

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

  -- What this villa owes right now, across every existing stage. Locked the villa row
  -- above, so a concurrent payment cannot move this figure out from under this check.
  SELECT COALESCE(SUM(
    (s.principal_amount - COALESCE(paid.principal_paid, 0) - COALESCE(cr.credit_applied, 0))
    + public.stage_interest_as_of(s.id, p_payment_date)
      - COALESCE((SELECT SUM(interest_amount) FROM public.v_live_allocations WHERE payment_stage_id = s.id), 0)
  ), 0)
  INTO v_total_owed
  FROM public.payment_stages s
  LEFT JOIN (
    SELECT payment_stage_id, SUM(principal_amount) AS principal_paid
    FROM public.v_live_allocations GROUP BY payment_stage_id
  ) paid ON paid.payment_stage_id = s.id
  LEFT JOIN (
    SELECT payment_stage_id, SUM(amount) AS credit_applied
    FROM public.advance_credit_applications GROUP BY payment_stage_id
  ) cr ON cr.payment_stage_id = s.id
  WHERE s.villa_id = p_villa_id AND s.due_date IS NOT NULL AND s.principal_amount > 0;

  -- +1 absorbs rounding only — not a loophole for a real overpayment. A correction's own
  -- old amount is not added back in here because `update_collection()` unwinds it (see
  -- above it in this file) before calling this function, so `v_total_owed` already
  -- reflects the room available exactly as the client computed it.
  IF p_amount > v_total_owed + 1 THEN
    RAISE EXCEPTION 'This payment (%) is more than % owes (%). Add a new payment stage first if this covers work beyond the current schedule.',
      to_char(p_amount, 'FM999,999,999,990.00'), v_villa.villa_number, to_char(v_total_owed, 'FM999,999,999,990.00')
      USING ERRCODE = 'check_violation';
  END IF;

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

  FOR v_stage IN
    SELECT s.id, s.principal_amount, s.due_date
    FROM public.payment_stages s
    WHERE s.villa_id = p_villa_id AND s.due_date IS NOT NULL AND s.principal_amount > 0
    ORDER BY s.due_date, s.stage_no
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_interest_owed := public.stage_interest_as_of(v_stage.id, p_payment_date);

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
    v_principal_due := v_principal_due - COALESCE(
      (SELECT SUM(amount) FROM public.advance_credit_applications WHERE payment_stage_id = v_stage.id), 0);
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

  -- With the guard above, `v_remaining` past this loop should only ever be the rounding
  -- slack the +1 check allows through — never a real, uncaught overpayment.
  v_credit := v_remaining;
  IF v_credit > 0 THEN
    INSERT INTO public.advance_credits (villa_id, collection_id, amount, status)
    VALUES (p_villa_id, v_collection_id, v_credit, 'available');
  END IF;

  IF v_allocated + v_credit <> p_amount THEN
    RAISE EXCEPTION 'Allocation does not balance: % allocated + % credit <> % received.',
      v_allocated, v_credit, p_amount USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_collection_id;
END;
$$;

COMMENT ON FUNCTION public.record_collection IS
  'Records a payment and allocates it oldest-stage-first. Refuses an amount beyond what the villa currently owes (principal + interest across existing stages) rather than banking the excess as advance credit — the company''s explicit choice, so an overpayment surfaces immediately instead of sitting as an unnoticed credit balance.';
