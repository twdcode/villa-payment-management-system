-- ============================================================
-- Re-derive a stage's charged interest after its grace period changes.
-- ============================================================
-- Extending a stage's grace period is how the company gives a late customer a break, but
-- until now it changed nothing: `stage_interest_as_of()` treats `interest_charged` as a
-- floor it always adds, and pins accrual to start no earlier than `interest_charged_to`.
-- Both exist for good reason — interest is path-dependent, so what was charged for days
-- already elapsed cannot be recovered from today's balance — but together they made
-- already-charged interest permanent regardless of any later terms change.
--
-- This function re-derives `interest_charged` from scratch under the stage's CURRENT
-- grace period, as of a given date. Extending grace past today therefore returns zero and
-- the charge is genuinely waived; shortening it re-derives a higher figure.
--
-- Interest the customer has already PAID is never reversed. `interest_paid` is money that
-- changed hands; unwinding it here would invent a credit balance out of a date edit. The
-- floor keeps the charge at least equal to what was paid, so a waiver can only ever remove
-- the unpaid portion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rederive_stage_interest(
  p_stage_id uuid,
  p_as_of    date
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_stage      public.payment_stages%ROWTYPE;
  v_terms      public.villa_interest_terms%ROWTYPE;
  v_paid       numeric(18,2);
  v_start      date;
  v_days       integer;
  v_rate       numeric;
  v_divisor    integer;
  v_fresh      numeric(18,2);
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = v_stage.villa_id;

  v_rate    := CASE WHEN COALESCE(v_terms.charge_interest, true) THEN COALESCE(v_terms.monthly_rate, 0) ELSE 0 END;
  v_divisor := NULLIF(COALESCE(v_terms.prorata_divisor, 30), 0);

  SELECT COALESCE(SUM(principal_amount), 0) INTO v_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  -- Deliberately NOT clamped to `interest_charged_to`: that clamp is what makes charged
  -- interest survive a grace extension, and removing it is the entire point here.
  v_start := CASE
    WHEN COALESCE(v_terms.interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + v_stage.grace_period_days * INTERVAL '1 day')::date
  END;

  v_days := GREATEST(0, p_as_of - v_start);
  v_fresh := ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / v_divisor, 2);

  -- Never below interest already collected — see the note above.
  v_fresh := GREATEST(v_fresh, v_stage.interest_paid);

  UPDATE public.payment_stages
  SET interest_charged    = v_fresh,
      interest_charged_to = CASE WHEN v_days > 0 THEN p_as_of ELSE NULL END
  WHERE id = p_stage_id;

  RETURN v_fresh;
END;
$$;

COMMENT ON FUNCTION public.rederive_stage_interest IS
  'Recomputes a stage''s charged interest from its current grace period, as of a date. Used when the grace period is edited so extending it actually waives the charge. Never drops below interest already paid.';

-- ------------------------------------------------------------
-- What a grace change WOULD waive, without writing anything.
--
-- The confirmation modal needs the figure before the user commits, and computing it in
-- TypeScript would mean a second implementation of the accrual rule that could drift from
-- this one. STABLE and free of side effects, so it is safe to call from a read path.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_stage_interest_waiver(
  p_stage_id   uuid,
  p_new_grace  integer,
  p_as_of      date
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
  v_fresh      numeric(18,2);
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = v_stage.villa_id;

  v_rate    := CASE WHEN COALESCE(v_terms.charge_interest, true) THEN COALESCE(v_terms.monthly_rate, 0) ELSE 0 END;
  v_divisor := NULLIF(COALESCE(v_terms.prorata_divisor, 30), 0);

  SELECT COALESCE(SUM(principal_amount), 0) INTO v_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  v_start := CASE
    WHEN COALESCE(v_terms.interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + p_new_grace * INTERVAL '1 day')::date
  END;

  v_days := GREATEST(0, p_as_of - v_start);
  v_fresh := GREATEST(ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / v_divisor, 2), v_stage.interest_paid);

  -- Positive means interest disappears if this is saved; zero or negative means it does not.
  RETURN GREATEST(0, v_stage.interest_charged - v_fresh);
END;
$$;

COMMENT ON FUNCTION public.preview_stage_interest_waiver IS
  'How much charged interest a proposed grace period would remove from a stage. Read-only, for the confirmation prompt shown before the change is saved.';
