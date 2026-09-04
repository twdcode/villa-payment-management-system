-- ============================================================
-- Derived views — balances are NEVER stored
-- ============================================================
-- Outstanding, overdue and interest figures are computed from the ledger every time.
-- A stored balance is a number that can disagree with the rows it came from; a derived
-- one cannot.
--
-- CRITICAL: the `superseded_at IS NULL` filter lives HERE, once. Individual queries must
-- read these views rather than the base tables, so a forgotten filter cannot double count
-- an edited collection.
-- ============================================================

-- ------------------------------------------------------------
-- The workspace's "today".
--
-- Every date-dependent view calls this instead of public.workspace_today(), for two reasons:
--   1. Asia/Colombo, not the server's timezone. A payment made at 09:00 in Colombo must
--      not land on the previous day because the database runs in UTC.
--   2. It can be overridden. Setting `app.workspace_today` pins the date, which is what
--      makes the worked examples in INTEREST-EXAMPLES.md testable and lets seeded demo
--      data line up (BACKEND-PLAN D4).
--
-- In production the setting is never set, so this is just today in Colombo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.workspace_today', true), '')::date,
    (now() AT TIME ZONE 'Asia/Colombo')::date
  );
$$;

COMMENT ON FUNCTION public.workspace_today() IS
  'Today in Asia/Colombo. Override with: SET app.workspace_today = ''2026-08-28'';';

-- Live collections only. Everything downstream builds on this.
CREATE OR REPLACE VIEW public.v_live_collections AS
SELECT *
FROM public.collections
WHERE superseded_at IS NULL;

-- Allocations belonging to live collections only.
CREATE OR REPLACE VIEW public.v_live_allocations AS
SELECT a.*, c.villa_id, c.payment_date, c.customer_id
FROM public.collection_allocations a
JOIN public.v_live_collections c ON c.id = a.collection_id;

-- ------------------------------------------------------------
-- Per-stage position: what is owed on each instalment.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_stage_position AS
SELECT
  s.id                AS stage_id,
  s.villa_id,
  s.stage_no,
  s.stage_name,
  s.due_date,
  s.grace_period_days,
  s.principal_amount,
  COALESCE(paid.principal_paid, 0)::numeric(18,2) AS principal_paid,
  COALESCE(paid.interest_paid,  0)::numeric(18,2) AS interest_paid,
  s.interest_charged,
  (s.principal_amount - COALESCE(paid.principal_paid, 0))::numeric(18,2) AS principal_outstanding,
  -- The last day of grace. Interest is charged for days AFTER this.
  (s.due_date + s.grace_period_days * INTERVAL '1 day')::date AS grace_ends_on,

  -- Chargeable days: whole days elapsed since grace ended, never negative.
  GREATEST(0, public.workspace_today() - (s.due_date + s.grace_period_days * INTERVAL '1 day')::date) AS overdue_days,

  -- Interest accrued to today. DERIVED, never stored — it changes every day, so a stored
  -- copy is stale the moment it is written (BACKEND-PLAN D3).
  -- Rate is a FRACTION (0.015 = 1.5%); `t.charge_interest = false` zeroes it entirely.
  ROUND(
    (s.principal_amount - COALESCE(paid.principal_paid, 0))
      * CASE WHEN COALESCE(t.charge_interest, true) THEN COALESCE(t.monthly_rate, 0) ELSE 0 END
      * GREATEST(0, public.workspace_today() - (s.due_date + s.grace_period_days * INTERVAL '1 day')::date)
      / NULLIF(COALESCE(t.prorata_divisor, 30), 0),
    2
  )::numeric(18,2) AS interest_accrued,

  -- The same five states the frontend's PaymentStatus union uses.
  CASE
    WHEN s.due_date IS NULL OR s.principal_amount <= 0                      THEN 'not_due'
    WHEN COALESCE(paid.principal_paid, 0) >= s.principal_amount             THEN 'paid'
    WHEN public.workspace_today() > (s.due_date + s.grace_period_days * INTERVAL '1 day')::date THEN 'overdue'
    WHEN COALESCE(paid.principal_paid, 0) > 0                               THEN 'partially_paid'
    WHEN public.workspace_today() >= s.due_date                                         THEN 'due'
    ELSE 'not_due'
  END AS status
FROM public.payment_stages s
LEFT JOIN public.villa_interest_terms t ON t.villa_id = s.villa_id
LEFT JOIN (
  SELECT payment_stage_id,
         SUM(principal_amount) AS principal_paid,
         SUM(interest_amount)  AS interest_paid
  FROM public.v_live_allocations
  GROUP BY payment_stage_id
) paid ON paid.payment_stage_id = s.id;

-- ------------------------------------------------------------
-- Per-villa position.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_villa_position AS
SELECT
  v.id AS villa_id,
  v.project_id,
  v.villa_number,
  v.villa_value,
  v.sale_status,
  v.programme_status,
  COALESCE(SUM(p.principal_amount),      0)::numeric(18,2) AS scheduled_principal,
  COALESCE(SUM(p.principal_paid),        0)::numeric(18,2) AS principal_collected,
  COALESCE(SUM(p.principal_outstanding), 0)::numeric(18,2) AS principal_outstanding,
  COALESCE(SUM(p.interest_paid),         0)::numeric(18,2) AS interest_collected,
  COALESCE(SUM(p.interest_accrued),      0)::numeric(18,2) AS interest_accrued,
  COALESCE(SUM(GREATEST(0, p.interest_accrued - p.interest_paid)), 0)::numeric(18,2) AS interest_outstanding,
  COALESCE(SUM(CASE WHEN p.status = 'overdue' THEN p.principal_outstanding ELSE 0 END), 0)::numeric(18,2) AS overdue_principal,
  COALESCE(credits.available,            0)::numeric(18,2) AS advance_credit_available
FROM public.villas v
LEFT JOIN public.v_stage_position p ON p.villa_id = v.id
LEFT JOIN (
  SELECT villa_id, SUM(amount) AS available
  FROM public.advance_credits
  WHERE status <> 'applied'
  GROUP BY villa_id
) credits ON credits.villa_id = v.id
GROUP BY v.id, v.project_id, v.villa_number, v.villa_value, v.sale_status, v.programme_status, credits.available;

-- ------------------------------------------------------------
-- Per-project and per-customer rollups.
-- Cancelled villas are excluded — they keep their history but stop counting.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_project_position AS
SELECT
  pr.id AS project_id,
  pr.name,
  COUNT(vp.villa_id)                                        AS villa_count,
  COALESCE(SUM(vp.scheduled_principal),   0)::numeric(18,2) AS scheduled_principal,
  COALESCE(SUM(vp.principal_collected),   0)::numeric(18,2) AS principal_collected,
  COALESCE(SUM(vp.principal_outstanding), 0)::numeric(18,2) AS principal_outstanding,
  COALESCE(SUM(vp.interest_collected),    0)::numeric(18,2) AS interest_collected,
  COALESCE(SUM(vp.interest_outstanding),  0)::numeric(18,2) AS interest_outstanding,
  COALESCE(SUM(vp.overdue_principal),     0)::numeric(18,2) AS overdue_principal
FROM public.projects pr
LEFT JOIN public.v_villa_position vp
       ON vp.project_id = pr.id AND vp.programme_status = 'active'
GROUP BY pr.id, pr.name;

CREATE OR REPLACE VIEW public.v_customer_position AS
SELECT
  c.id AS customer_id,
  c.full_name,
  COUNT(vp.villa_id)                                        AS villa_count,
  COALESCE(SUM(vp.scheduled_principal),   0)::numeric(18,2) AS scheduled_principal,
  COALESCE(SUM(vp.principal_collected),   0)::numeric(18,2) AS principal_collected,
  COALESCE(SUM(vp.principal_outstanding), 0)::numeric(18,2) AS principal_outstanding,
  COALESCE(SUM(vp.overdue_principal),     0)::numeric(18,2) AS overdue_principal
FROM public.customers c
LEFT JOIN public.villa_customers vc ON vc.customer_id = c.id AND vc.unassigned_at IS NULL
LEFT JOIN public.v_villa_position vp ON vp.villa_id = vc.villa_id AND vp.programme_status = 'active'
GROUP BY c.id, c.full_name;

-- ------------------------------------------------------------
-- Reconciliation: the invariant, checked continuously.
--
--   collection.amount = SUM(allocations) + SUM(advance credit)
--
-- This view MUST return zero rows. Any row is money that has gone somewhere it should
-- not have, and it is a bug to fix, not a rounding difference to tolerate.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ledger_reconciliation AS
SELECT
  c.id AS collection_id,
  c.receipt_no,
  c.villa_id,
  c.payment_date,
  c.amount                                        AS recorded_amount,
  COALESCE(a.allocated, 0)::numeric(18,2)         AS allocated_amount,
  COALESCE(cr.credited, 0)::numeric(18,2)         AS advance_credit,
  (c.amount - COALESCE(a.allocated, 0) - COALESCE(cr.credited, 0))::numeric(18,2) AS discrepancy
FROM public.v_live_collections c
LEFT JOIN (
  SELECT collection_id, SUM(principal_amount + interest_amount) AS allocated
  FROM public.collection_allocations
  GROUP BY collection_id
) a ON a.collection_id = c.id
LEFT JOIN (
  SELECT collection_id, SUM(amount) AS credited
  FROM public.advance_credits
  GROUP BY collection_id
) cr ON cr.collection_id = c.id
WHERE c.amount <> COALESCE(a.allocated, 0) + COALESCE(cr.credited, 0);

COMMENT ON VIEW public.v_ledger_reconciliation IS
  'Must always be empty. Each row is a collection whose allocations do not sum to the amount received.';

-- ------------------------------------------------------------
-- Receipts.
--
-- A receipt is NOT a separate table. Every field the frontend's `Receipt` type needs is
-- already a fact about the collection and its allocations, so storing it again would put
-- the same money in two places and invite them to disagree.
--
-- `collection_id` doubles as the receipt id: one live collection has exactly one receipt.
-- An edited collection keeps its original `receipt_no`, and because this view reads
-- `v_live_collections` only the corrected version appears.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_receipts AS
SELECT
  c.id                                            AS id,
  c.receipt_no                                    AS number,
  c.id                                            AS collection_id,
  c.payment_date                                  AS issued_at,
  COALESCE(a.principal, 0)::numeric(18,2)         AS principal_amount,
  COALESCE(a.interest,  0)::numeric(18,2)         AS interest_amount,
  c.amount                                        AS total_amount,
  c.villa_id,
  c.customer_id
FROM public.v_live_collections c
LEFT JOIN (
  SELECT collection_id,
         SUM(principal_amount) AS principal,
         SUM(interest_amount)  AS interest
  FROM public.collection_allocations
  GROUP BY collection_id
) a ON a.collection_id = c.id;

COMMENT ON VIEW public.v_receipts IS
  'Receipts derived from live collections. No receipts table exists by design — storing the amounts again would duplicate money.';
