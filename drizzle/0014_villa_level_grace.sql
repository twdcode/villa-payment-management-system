-- ============================================================
-- Grace period moves to the villa's interest terms, beside the rate.
-- ============================================================
-- Grace was the only agreement term stored per STAGE. Rate, pro-rata divisor, interest
-- start and allocation order all live on `villa_interest_terms`, so "Edit interest terms"
-- offered a grace field that changed nothing about existing stages — the calculation read
-- `payment_stages.grace_period_days` instead, and the only way to actually move a due date's
-- grace was the payment-schedule editor. Two screens, two meanings, one surprising result.
--
-- After this, grace behaves exactly like the rate: read from the villa's terms, applied to
-- whatever principal is still outstanding.
--
-- `payment_stages.grace_period_days` is deliberately KEPT, not dropped. It records the
-- grace each stage was created with, which is history worth having, and dropping a column
-- that six migrations reference is a far larger change than ceasing to read it.
--
-- ------------------------------------------------------------
-- The floor: interest a customer has actually PAID can never be waived.
-- ------------------------------------------------------------
-- Lowering the rate, extending grace or switching interest off all reduce accrual. None of
-- them may reduce it below what the customer has already handed over, or the stage reports
-- less interest charged than collected — a contradiction that shows up as a negative
-- outstanding figure.
--
-- The floor previously read `payment_stages.interest_paid`, a stored column that can drift
-- from the allocations behind it (villa 02 carried 0 there while its allocations recorded
-- LKR 6,000, so the floor silently did nothing). It now reads `v_live_allocations`, the
-- same source `v_stage_position.interest_paid` derives from, so the rule is true by
-- construction rather than by two columns happening to agree.
-- ============================================================

-- ------------------------------------------------------------
-- Interest owed on a stage as of a date, under the villa's CURRENT terms.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stage_interest_as_of(p_stage_id uuid, p_as_of date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage         public.payment_stages%ROWTYPE;
  v_terms         public.villa_interest_terms%ROWTYPE;
  v_paid          numeric(18,2);
  v_interest_paid numeric(18,2);
  v_start         date;
  v_days          integer;
  v_rate          numeric;
  v_divisor       integer;
  v_grace         integer;
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = v_stage.villa_id;

  v_rate    := CASE WHEN COALESCE(v_terms.charge_interest, true) THEN COALESCE(v_terms.monthly_rate, 0) ELSE 0 END;
  v_divisor := NULLIF(COALESCE(v_terms.prorata_divisor, 30), 0);
  -- The villa's grace, not the stage's. Falls back to the stage only when a villa has no
  -- terms row at all, so a half-configured villa still behaves as it did before.
  v_grace   := COALESCE(v_terms.grace_days, v_stage.grace_period_days, 0);

  SELECT COALESCE(SUM(principal_amount), 0), COALESCE(SUM(interest_amount), 0)
  INTO v_paid, v_interest_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  v_start := CASE
    WHEN COALESCE(v_terms.interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + v_grace * INTERVAL '1 day')::date
  END;
  IF v_stage.interest_charged_to IS NOT NULL AND v_stage.interest_charged_to > v_start THEN
    v_start := v_stage.interest_charged_to;
  END IF;

  v_days := GREATEST(0, p_as_of - v_start);

  RETURN GREATEST(
    v_stage.interest_charged + ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / v_divisor, 2),
    v_interest_paid
  );
END;
$$;

COMMENT ON FUNCTION public.stage_interest_as_of(uuid, date) IS
  'Interest owed on a stage as of a date, using the villa''s current terms (rate AND grace). Never returns less than the interest already collected against the stage.';

-- ------------------------------------------------------------
-- Recompute a stage's CHARGED interest from the villa's current terms.
--
-- Called after the terms change so an extended grace or a lowered rate actually takes
-- effect on stages that are still outstanding. A settled stage has nothing outstanding, so
-- the accrual term is zero and the floor holds it at whatever was collected — which is why
-- "only affects unpaid stages" needs no explicit status check.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rederive_stage_interest(p_stage_id uuid, p_as_of date)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_stage         public.payment_stages%ROWTYPE;
  v_terms         public.villa_interest_terms%ROWTYPE;
  v_paid          numeric(18,2);
  v_interest_paid numeric(18,2);
  v_start         date;
  v_days          integer;
  v_rate          numeric;
  v_divisor       integer;
  v_grace         integer;
  v_fresh         numeric(18,2);
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_terms FROM public.villa_interest_terms WHERE villa_id = v_stage.villa_id;

  v_rate    := CASE WHEN COALESCE(v_terms.charge_interest, true) THEN COALESCE(v_terms.monthly_rate, 0) ELSE 0 END;
  v_divisor := NULLIF(COALESCE(v_terms.prorata_divisor, 30), 0);
  v_grace   := COALESCE(v_terms.grace_days, v_stage.grace_period_days, 0);

  SELECT COALESCE(SUM(principal_amount), 0), COALESCE(SUM(interest_amount), 0)
  INTO v_paid, v_interest_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  -- Deliberately NOT clamped to `interest_charged_to`: that clamp is what makes charged
  -- interest survive a terms change, and re-deriving from scratch is the point here.
  v_start := CASE
    WHEN COALESCE(v_terms.interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + v_grace * INTERVAL '1 day')::date
  END;

  v_days  := GREATEST(0, p_as_of - v_start);
  v_fresh := ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / v_divisor, 2);

  -- The floor, from the allocations rather than the stored column.
  v_fresh := GREATEST(v_fresh, v_interest_paid);

  UPDATE public.payment_stages
  SET interest_charged    = v_fresh,
      interest_charged_to = CASE WHEN v_days > 0 THEN p_as_of ELSE NULL END
  WHERE id = p_stage_id;

  RETURN v_fresh;
END;
$$;

COMMENT ON FUNCTION public.rederive_stage_interest IS
  'Recomputes a stage''s charged interest from the villa''s current terms (rate and grace). Never drops below interest already collected against the stage.';

-- ------------------------------------------------------------
-- Preview: what a proposed change WOULD remove, without writing.
--
-- Takes the whole proposed terms rather than just a grace number, so the confirmation
-- prompt can cover a rate change and an interest-off switch too — all three reduce
-- accrual, and until now only grace warned about it.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.preview_stage_interest_waiver(uuid, integer, date);

CREATE OR REPLACE FUNCTION public.preview_stage_interest_waiver(
  p_stage_id        uuid,
  p_grace_days      integer,
  p_monthly_rate    numeric,
  p_charge_interest boolean,
  p_interest_start  text,
  p_divisor         integer,
  p_as_of           date
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage         public.payment_stages%ROWTYPE;
  v_paid          numeric(18,2);
  v_interest_paid numeric(18,2);
  v_start         date;
  v_days          integer;
  v_rate          numeric;
  v_fresh         numeric(18,2);
BEGIN
  SELECT * INTO v_stage FROM public.payment_stages WHERE id = p_stage_id;
  IF NOT FOUND OR v_stage.due_date IS NULL OR v_stage.principal_amount <= 0 THEN
    RETURN 0;
  END IF;

  v_rate := CASE WHEN COALESCE(p_charge_interest, true) THEN COALESCE(p_monthly_rate, 0) ELSE 0 END;

  SELECT COALESCE(SUM(principal_amount), 0), COALESCE(SUM(interest_amount), 0)
  INTO v_paid, v_interest_paid
  FROM public.v_live_allocations WHERE payment_stage_id = p_stage_id;

  v_start := CASE
    WHEN COALESCE(p_interest_start, 'after_grace') = 'from_due_date'
      THEN v_stage.due_date
    ELSE (v_stage.due_date + COALESCE(p_grace_days, 0) * INTERVAL '1 day')::date
  END;

  v_days  := GREATEST(0, p_as_of - v_start);
  v_fresh := GREATEST(
    ROUND((v_stage.principal_amount - v_paid) * v_rate * v_days / NULLIF(COALESCE(p_divisor, 30), 0), 2),
    v_interest_paid
  );

  -- Positive means charged interest disappears if this is saved.
  RETURN GREATEST(0, v_stage.interest_charged - v_fresh);
END;
$$;

COMMENT ON FUNCTION public.preview_stage_interest_waiver IS
  'How much charged interest a proposed set of interest terms would remove from a stage. Read-only, for the confirmation prompt shown before saving.';

-- ------------------------------------------------------------
-- `v_stage_position`: overdue status and accrual now use the villa's grace.
--
-- `grace_period_days` is still exposed as a column so existing readers keep working, but
-- it now reports the EFFECTIVE grace — what the calculation actually used — rather than
-- the stage's stored value, which is no longer what determines anything.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_stage_position CASCADE;

CREATE VIEW public.v_stage_position AS
SELECT
  s.id AS stage_id,
  s.villa_id,
  s.stage_no,
  s.stage_name,
  s.deliverables,
  s.due_date,
  COALESCE(t.grace_days, s.grace_period_days, 0) AS grace_period_days,
  s.principal_amount,
  (COALESCE(paid.principal_paid, 0) + COALESCE(cr.credit_applied, 0))::numeric(18,2) AS principal_paid,
  COALESCE(paid.interest_paid, 0)::numeric(18,2) AS interest_paid,
  s.interest_charged,
  (s.principal_amount - COALESCE(paid.principal_paid, 0) - COALESCE(cr.credit_applied, 0))::numeric(18,2) AS principal_outstanding,
  (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date AS grace_ends_on,
  GREATEST(0, public.workspace_today() - (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date) AS overdue_days,
  GREATEST(0, public.workspace_today() - GREATEST(COALESCE(s.interest_charged_to, (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date), (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date)) AS uncharged_days,
  -- Floored at interest already collected, matching `stage_interest_as_of`: a lowered rate
  -- or extended grace must never report less charged than the customer has paid.
  GREATEST(
    (s.interest_charged + ROUND(
      (s.principal_amount - COALESCE(paid.principal_paid, 0) - COALESCE(cr.credit_applied, 0))
        * CASE WHEN COALESCE(t.charge_interest, true) THEN COALESCE(t.monthly_rate, 0) ELSE 0 END
        * GREATEST(0, public.workspace_today() - GREATEST(COALESCE(s.interest_charged_to, (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date), (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date))::numeric
        / NULLIF(COALESCE(t.prorata_divisor, 30), 0)::numeric, 2)),
    COALESCE(paid.interest_paid, 0)
  )::numeric(18,2) AS interest_accrued,
  CASE
    WHEN s.due_date IS NULL OR s.principal_amount <= 0 THEN 'not_due'
    WHEN COALESCE(paid.principal_paid, 0) + COALESCE(cr.credit_applied, 0) >= s.principal_amount THEN 'paid'
    WHEN public.workspace_today() > (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date THEN 'overdue'
    WHEN COALESCE(paid.principal_paid, 0) + COALESCE(cr.credit_applied, 0) > 0 THEN 'partially_paid'
    WHEN public.workspace_today() >= s.due_date THEN 'due'
    ELSE 'not_due'
  END AS status
FROM public.payment_stages s
LEFT JOIN public.villa_interest_terms t ON t.villa_id = s.villa_id
LEFT JOIN (
  SELECT payment_stage_id, SUM(principal_amount) AS principal_paid, SUM(interest_amount) AS interest_paid
  FROM public.v_live_allocations GROUP BY payment_stage_id
) paid ON paid.payment_stage_id = s.id
LEFT JOIN (
  SELECT payment_stage_id, SUM(amount) AS credit_applied
  FROM public.advance_credit_applications GROUP BY payment_stage_id
) cr ON cr.payment_stage_id = s.id;

-- ------------------------------------------------------------
-- Recreated unchanged: dropped only by the CASCADE above.
-- ------------------------------------------------------------

CREATE VIEW public.v_villa_position AS
 SELECT v.id AS villa_id,
    v.project_id,
    v.villa_number,
    v.villa_value,
    v.sale_status,
    v.programme_status,
    COALESCE(sum(p.principal_amount), 0::numeric)::numeric(18,2) AS scheduled_principal,
    COALESCE(sum(p.principal_paid), 0::numeric)::numeric(18,2) AS principal_collected,
    COALESCE(sum(p.principal_outstanding), 0::numeric)::numeric(18,2) AS principal_outstanding,
    COALESCE(sum(p.interest_paid), 0::numeric)::numeric(18,2) AS interest_collected,
    COALESCE(sum(p.interest_accrued), 0::numeric)::numeric(18,2) AS interest_accrued,
    COALESCE(sum(GREATEST(0::numeric, p.interest_accrued - p.interest_paid)), 0::numeric)::numeric(18,2) AS interest_outstanding,
    COALESCE(sum(
        CASE
            WHEN p.status = 'overdue'::text THEN p.principal_outstanding
            ELSE 0::numeric
        END), 0::numeric)::numeric(18,2) AS overdue_principal,
    COALESCE(credits.available, 0::numeric)::numeric(18,2) AS advance_credit_available
   FROM villas v
     LEFT JOIN v_stage_position p ON p.villa_id = v.id
     LEFT JOIN ( SELECT advance_credits.villa_id,
            sum(advance_credits.amount) AS available
           FROM advance_credits
          WHERE advance_credits.status <> 'applied'::advance_credit_status
          GROUP BY advance_credits.villa_id) credits ON credits.villa_id = v.id
  GROUP BY v.id, v.project_id, v.villa_number, v.villa_value, v.sale_status, v.programme_status, credits.available;

CREATE VIEW public.v_project_position AS
 SELECT pr.id AS project_id,
    pr.name,
    count(vp.villa_id) AS villa_count,
    COALESCE(sum(vp.scheduled_principal), 0::numeric)::numeric(18,2) AS scheduled_principal,
    COALESCE(sum(vp.principal_collected), 0::numeric)::numeric(18,2) AS principal_collected,
    COALESCE(sum(vp.principal_outstanding), 0::numeric)::numeric(18,2) AS principal_outstanding,
    COALESCE(sum(vp.interest_collected), 0::numeric)::numeric(18,2) AS interest_collected,
    COALESCE(sum(vp.interest_outstanding), 0::numeric)::numeric(18,2) AS interest_outstanding,
    COALESCE(sum(vp.overdue_principal), 0::numeric)::numeric(18,2) AS overdue_principal
   FROM projects pr
     LEFT JOIN v_villa_position vp ON vp.project_id = pr.id AND vp.programme_status = 'active'::villa_programme_status
  GROUP BY pr.id, pr.name;

CREATE VIEW public.v_customer_position AS
 SELECT c.id AS customer_id,
    c.full_name,
    count(vp.villa_id) AS villa_count,
    COALESCE(sum(vp.scheduled_principal), 0::numeric)::numeric(18,2) AS scheduled_principal,
    COALESCE(sum(vp.principal_collected), 0::numeric)::numeric(18,2) AS principal_collected,
    COALESCE(sum(vp.principal_outstanding), 0::numeric)::numeric(18,2) AS principal_outstanding,
    COALESCE(sum(vp.overdue_principal), 0::numeric)::numeric(18,2) AS overdue_principal
   FROM customers c
     LEFT JOIN villa_customers vc ON vc.customer_id = c.id AND vc.unassigned_at IS NULL
     LEFT JOIN v_villa_position vp ON vp.villa_id = vc.villa_id AND vp.programme_status = 'active'::villa_programme_status
  GROUP BY c.id, c.full_name;

-- ------------------------------------------------------------
-- The reminder queue reads the villa's grace too, so extending it moves the reminder
-- thresholds with the overdue date rather than leaving them anchored to the old one.
-- The `villa_interest_terms` join was already there for the reminder-day columns; only
-- the grace expression changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_due_reminders()
 RETURNS TABLE(queued_count integer, skipped_no_template integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_today    date := public.workspace_today();
  v_stage    RECORD;
  v_queued   integer := 0;
  v_skipped  integer := 0;
  v_result   integer;
BEGIN
  FOR v_stage IN
    SELECT
      s.id AS stage_id,
      s.villa_id,
      vc.customer_id,
      (s.due_date + COALESCE(t.grace_days, s.grace_period_days, 0) * INTERVAL '1 day')::date AS grace_ends_on,
      s.due_date,
      COALESCE(t.first_reminder_day,  d.first_reminder_day)  AS first_reminder_day,
      COALESCE(t.second_reminder_day, d.second_reminder_day) AS second_reminder_day,
      COALESCE(t.final_notice_day,    d.final_notice_day)    AS final_notice_day
    FROM public.payment_stages s
    JOIN public.villas v ON v.id = s.villa_id AND v.programme_status = 'active' AND v.deleted_at IS NULL
    JOIN public.villa_customers vc ON vc.villa_id = s.villa_id AND vc.unassigned_at IS NULL
    LEFT JOIN public.villa_interest_terms t ON t.villa_id = s.villa_id
    CROSS JOIN public.interest_defaults d
    LEFT JOIN (
      SELECT payment_stage_id, SUM(principal_amount) AS principal_paid
      FROM public.v_live_allocations GROUP BY payment_stage_id
    ) paid ON paid.payment_stage_id = s.id
    WHERE s.due_date IS NOT NULL AND s.principal_amount > 0
      AND (s.principal_amount - COALESCE(paid.principal_paid, 0)) > 0
  LOOP
    IF v_today >= v_stage.due_date - 7 AND v_today < v_stage.due_date THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'upcoming', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.first_reminder_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'overdue_first', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.second_reminder_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'overdue_second', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.final_notice_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'final_notice', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_queued, v_skipped;
END;
$function$
