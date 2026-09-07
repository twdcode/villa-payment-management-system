-- ============================================================
-- Advance credit: automatic drawdown.
-- ============================================================
-- `record_collection()` already banks money with no unpaid stage left to absorb it as an
-- `advance_credits` row. What never existed was the other half: drawing that credit down
-- again when a stage later needs it. `advance_credit_applications` was declared in 0000
-- and has never been written to, so a credit sat visible forever while the stage it
-- should have paid went overdue.
--
-- IMPORTANT — why a drawdown never reduces `advance_credits.amount`:
-- `v_ledger_reconciliation` (0002) asserts, for every collection,
--     amount = SUM(collection_allocations) + SUM(advance_credits)
-- If applying a credit shrank `advance_credits.amount`, that identity would break and
-- every applied credit would surface as a ledger failure — the alert that is supposed to
-- mean "money is unaccounted for". So `amount` stays the ORIGINAL sum banked, drawdowns
-- live only in `advance_credit_applications`, and the remaining balance is derived. The
-- `available / partially_applied / applied` enum from 0000 anticipated exactly this.
-- ============================================================

-- ------------------------------------------------------------
-- Remaining balance per credit: what was banked, less what has been drawn down.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_advance_credit_balance AS
SELECT
  ac.id,
  ac.villa_id,
  ac.collection_id,
  ac.amount                                            AS amount_banked,
  COALESCE(ap.applied, 0)::numeric(18,2)               AS amount_applied,
  (ac.amount - COALESCE(ap.applied, 0))::numeric(18,2) AS amount_remaining,
  ac.status,
  ac.created_at
FROM public.advance_credits ac
LEFT JOIN (
  SELECT advance_credit_id, SUM(amount) AS applied
  FROM public.advance_credit_applications
  GROUP BY advance_credit_id
) ap ON ap.advance_credit_id = ac.id;

COMMENT ON VIEW public.v_advance_credit_balance IS
  'Per-credit remaining balance. amount_banked never changes (v_ledger_reconciliation depends on it); drawdowns are rows in advance_credit_applications.';

-- ------------------------------------------------------------
-- Draw a villa's available credit down against its unpaid stages, oldest first.
-- Returns the total applied. Safe to call repeatedly — it only ever moves money that is
-- genuinely available onto stages that genuinely still owe.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_advance_credits(
  p_villa_id   uuid,
  p_as_of      date DEFAULT NULL,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_as_of       date := COALESCE(p_as_of, public.workspace_today());
  v_stage       RECORD;
  v_credit      RECORD;
  v_principal   numeric(18,2);
  v_take        numeric(18,2);
  v_total       numeric(18,2) := 0;
BEGIN
  -- Oldest stage first, matching the allocation order in `record_collection()`. Only
  -- stages already due are settled: credit is the customer's money until a payment
  -- obligation actually arises, so paying down a stage that is not yet due would take it
  -- early.
  FOR v_stage IN
    SELECT s.id, s.principal_amount
    FROM public.payment_stages s
    JOIN public.villas v ON v.id = s.villa_id
      AND v.programme_status = 'active' AND v.deleted_at IS NULL
    WHERE s.villa_id = p_villa_id
      AND s.due_date IS NOT NULL
      AND s.due_date <= v_as_of
      AND s.principal_amount > 0
    ORDER BY s.due_date, s.stage_no
  LOOP
    v_principal := v_stage.principal_amount - COALESCE(
      (SELECT SUM(principal_amount) FROM public.v_live_allocations WHERE payment_stage_id = v_stage.id), 0);
    v_principal := v_principal - COALESCE(
      (SELECT SUM(amount) FROM public.advance_credit_applications WHERE payment_stage_id = v_stage.id), 0);
    v_principal := GREATEST(0, v_principal);
    CONTINUE WHEN v_principal = 0;

    -- Oldest credit first, so a customer's earliest money is spent first.
    FOR v_credit IN
      SELECT id, amount_remaining
      FROM public.v_advance_credit_balance
      WHERE villa_id = p_villa_id AND amount_remaining > 0
      ORDER BY created_at, id
    LOOP
      EXIT WHEN v_principal = 0;
      v_take := LEAST(v_principal, v_credit.amount_remaining);
      CONTINUE WHEN v_take <= 0;

      -- The application row IS the record of payment. `payment_stages.principal_paid` is
      -- deliberately not touched: `v_stage_position` derives paid-ness, and writing a
      -- stored copy here created a second source of truth that disagreed with it.
      INSERT INTO public.advance_credit_applications (advance_credit_id, payment_stage_id, amount, applied_by)
      VALUES (v_credit.id, v_stage.id, v_take, p_actor_id);

      v_principal := v_principal - v_take;
      v_total     := v_total + v_take;
    END LOOP;
  END LOOP;

  -- Status is derived from the applications, never set by hand, so it cannot drift away
  -- from the rows that back it.
  UPDATE public.advance_credits ac
  SET status = CASE
        WHEN b.amount_remaining <= 0        THEN 'applied'
        WHEN b.amount_remaining < ac.amount THEN 'partially_applied'
        ELSE 'available'
      END::public.advance_credit_status
  FROM public.v_advance_credit_balance b
  WHERE b.id = ac.id AND ac.villa_id = p_villa_id;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.apply_advance_credits IS
  'Draws a villa''s available advance credit down against its due, unpaid stages (oldest first). Idempotent; returns the amount applied.';

-- ------------------------------------------------------------
-- `v_stage_position` derived principal_paid from `v_live_allocations` alone, so a stage
-- settled by advance credit still read as fully outstanding — the money had moved but no
-- view could see it. Credit applications are now a second source of principal paid,
-- summed alongside collection allocations everywhere the original expression appeared
-- (principal_paid, principal_outstanding, interest_accrued's balance, and the status CASE).
--
-- This also removes the need for `apply_advance_credits()` to write
-- `payment_stages.principal_paid`: that column is a stored duplicate the view ignores, and
-- writing it created two disagreeing sources of truth. Paid-ness stays derived.
-- ------------------------------------------------------------
-- CASCADE: v_villa_position depends on this, and v_project_position /
-- v_customer_position depend on that. All three are recreated verbatim below — only
-- v_stage_position's expressions change.
DROP VIEW IF EXISTS public.v_stage_position CASCADE;

CREATE VIEW public.v_stage_position AS
SELECT
  s.id AS stage_id,
  s.villa_id,
  s.stage_no,
  s.stage_name,
  s.deliverables,
  s.due_date,
  s.grace_period_days,
  s.principal_amount,
  (COALESCE(paid.principal_paid, 0) + COALESCE(cr.credit_applied, 0))::numeric(18,2) AS principal_paid,
  COALESCE(paid.interest_paid, 0)::numeric(18,2) AS interest_paid,
  s.interest_charged,
  (s.principal_amount - COALESCE(paid.principal_paid, 0) - COALESCE(cr.credit_applied, 0))::numeric(18,2) AS principal_outstanding,
  (s.due_date + s.grace_period_days * INTERVAL '1 day')::date AS grace_ends_on,
  GREATEST(0, public.workspace_today() - (s.due_date + s.grace_period_days * INTERVAL '1 day')::date) AS overdue_days,
  GREATEST(0, public.workspace_today() - GREATEST(COALESCE(s.interest_charged_to, (s.due_date + s.grace_period_days * INTERVAL '1 day')::date), (s.due_date + s.grace_period_days * INTERVAL '1 day')::date)) AS uncharged_days,
  (s.interest_charged + ROUND(
    (s.principal_amount - COALESCE(paid.principal_paid, 0) - COALESCE(cr.credit_applied, 0))
      * CASE WHEN COALESCE(t.charge_interest, true) THEN COALESCE(t.monthly_rate, 0) ELSE 0 END
      * GREATEST(0, public.workspace_today() - GREATEST(COALESCE(s.interest_charged_to, (s.due_date + s.grace_period_days * INTERVAL '1 day')::date), (s.due_date + s.grace_period_days * INTERVAL '1 day')::date))::numeric
      / NULLIF(COALESCE(t.prorata_divisor, 30), 0)::numeric, 2))::numeric(18,2) AS interest_accrued,
  CASE
    WHEN s.due_date IS NULL OR s.principal_amount <= 0 THEN 'not_due'
    WHEN COALESCE(paid.principal_paid, 0) + COALESCE(cr.credit_applied, 0) >= s.principal_amount THEN 'paid'
    WHEN public.workspace_today() > (s.due_date + s.grace_period_days * INTERVAL '1 day')::date THEN 'overdue'
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


-- Recreated unchanged (dropped only by the CASCADE above).
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

-- Recreated unchanged (dropped only by the CASCADE above).
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

-- Recreated unchanged (dropped only by the CASCADE above).
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
