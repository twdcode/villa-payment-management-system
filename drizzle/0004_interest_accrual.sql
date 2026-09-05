-- ============================================================
-- Interest becomes a RECORDED EVENT, not a formula re-run daily
-- ============================================================
-- The bug this fixes, reproduced in SQL before the change:
--
--   Stage 10,000,000 due 01 Jan, grace ends 16 Jan.
--   15 Feb: 30 chargeable days -> 150,000 interest. Customer pays 150,000
--           interest + 5,000,000 principal. Balance falls to 5,000,000.
--   17 Mar: 30 more days on 5,000,000 -> 75,000 is genuinely owed.
--           v_stage_position reported 0.
--
-- Cause: interest_accrued recomputed `outstanding x rate x days-since-grace-end`
-- every read. Once principal drops, that expression applies TODAY's smaller balance
-- to days when the balance was larger — rewriting history. The figure it produced
-- (75,000) was already less than the 150,000 the customer had actually paid, so
-- `GREATEST(0, accrued - paid)` clamped to zero and the meter stalled for weeks.
-- The frontend's Math.max(stored, live) had the identical effect. Neither layer was
-- wrong about arithmetic; both were asking a question that has no correct answer,
-- because accrued interest is path-dependent and cannot be recovered from the
-- current balance alone.
--
-- The fix, per INTEREST-EXAMPLES.md E5/E8 and BACKEND-PLAN C8: charge interest for a
-- period, round once, STORE it, and move an anchor date forward. Interest then accrues
-- only over days not already charged, always on the balance that actually applied
-- during those days.
--
--   payment_stages.interest_charged     cumulative interest ever charged (already existed,
--                                       declared in 0000 but never written to)
--   payment_stages.interest_charged_to  the date interest has been charged UP TO
--
-- `interest_charged_to` is NULL until the first charge; the view then falls back to
-- grace-end, so every existing stage keeps its current figure and nothing restates.
-- ============================================================

ALTER TABLE public.payment_stages
  ADD COLUMN IF NOT EXISTS interest_charged_to date;

COMMENT ON COLUMN public.payment_stages.interest_charged IS
  'Cumulative interest CHARGED to this stage. Written when a collection is recorded, never recomputed from the formula (E8). Compare against interest_paid to get what is outstanding.';

COMMENT ON COLUMN public.payment_stages.interest_charged_to IS
  'Interest has been charged up to and including this date. NULL means nothing charged yet, so accrual starts at grace-end. Moves forward on every charge; rewound on an edit so interest re-derives from the corrected values (E10).';

-- Interest already charged can never be less than interest received against it.
ALTER TABLE public.payment_stages
  ADD CONSTRAINT payment_stages_charged_covers_paid
  CHECK (interest_paid <= interest_charged + 0.005);

-- ------------------------------------------------------------
-- v_stage_position, corrected.
--
-- interest_accrued = interest already charged  +  interest running since the anchor
--
-- The second term is what the old view computed for the WHOLE overdue window; it now
-- covers only the uncharged tail, so a balance change can never retroactively alter
-- days that were already charged and settled.
-- ------------------------------------------------------------
-- Dropped rather than REPLACEd: a new column is being introduced mid-list, which
-- CREATE OR REPLACE VIEW cannot do. The dependent rollups are rebuilt identically
-- below — their definitions are unchanged, they simply have to be recreated.
DROP VIEW IF EXISTS public.v_customer_position;
DROP VIEW IF EXISTS public.v_project_position;
DROP VIEW IF EXISTS public.v_villa_position;
DROP VIEW IF EXISTS public.v_stage_position;

CREATE VIEW public.v_stage_position AS
SELECT
  s.id                AS stage_id,
  s.villa_id,
  s.stage_no,
  s.stage_name,
  s.deliverables,
  s.due_date,
  s.grace_period_days,
  s.principal_amount,
  COALESCE(paid.principal_paid, 0)::numeric(18,2) AS principal_paid,
  COALESCE(paid.interest_paid,  0)::numeric(18,2) AS interest_paid,
  s.interest_charged,
  (s.principal_amount - COALESCE(paid.principal_paid, 0))::numeric(18,2) AS principal_outstanding,
  (s.due_date + s.grace_period_days * INTERVAL '1 day')::date AS grace_ends_on,

  GREATEST(0, public.workspace_today() - (s.due_date + s.grace_period_days * INTERVAL '1 day')::date) AS overdue_days,

  -- Days not yet charged: from the anchor (or grace-end if never charged) to today.
  GREATEST(
    0,
    public.workspace_today()
      - GREATEST(
          COALESCE(s.interest_charged_to, (s.due_date + s.grace_period_days * INTERVAL '1 day')::date),
          (s.due_date + s.grace_period_days * INTERVAL '1 day')::date
        )
  ) AS uncharged_days,

  -- Charged (a stored fact) + accrual over the uncharged tail only.
  (
    s.interest_charged
    + ROUND(
        (s.principal_amount - COALESCE(paid.principal_paid, 0))
          * CASE WHEN COALESCE(t.charge_interest, true) THEN COALESCE(t.monthly_rate, 0) ELSE 0 END
          * GREATEST(
              0,
              public.workspace_today()
                - GREATEST(
                    COALESCE(s.interest_charged_to, (s.due_date + s.grace_period_days * INTERVAL '1 day')::date),
                    (s.due_date + s.grace_period_days * INTERVAL '1 day')::date
                  )
            )
          / NULLIF(COALESCE(t.prorata_divisor, 30), 0),
        2
      )
  )::numeric(18,2) AS interest_accrued,

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

COMMENT ON VIEW public.v_stage_position IS
  'Per-stage position. interest_accrued = interest_charged (stored) + accrual over days since interest_charged_to. Interest is never recomputed across days already charged — see 0004_interest_accrual.sql.';

-- ------------------------------------------------------------
-- Dependent rollups, recreated unchanged. They read v_stage_position and had to be
-- dropped so it could be rebuilt; nothing about their logic differs from 0002.
-- ------------------------------------------------------------
CREATE VIEW public.v_villa_position AS
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
CREATE VIEW public.v_project_position AS
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

CREATE VIEW public.v_customer_position AS
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
