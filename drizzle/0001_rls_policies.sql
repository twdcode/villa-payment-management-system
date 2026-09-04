-- ============================================================
-- Row Level Security — deny by default on every table
-- ============================================================
-- This is a BACKSTOP, not the gate. Authorisation is enforced in server actions,
-- which check session and role before touching the database. RLS is what stops a
-- mistake there from becoming a data breach.
--
-- The app connects over the transaction pooler as the table owner, which BYPASSES RLS.
-- These policies therefore protect against a leaked publishable key or an accidentally
-- exposed Data API — defence in depth, not the primary control.
--
-- Scope groundwork: every policy reads `scope = 'global' OR <assignment check>`.
-- Postgres short-circuits the OR, so a global user never pays for the assignment
-- lookup. Adding scoped roles later is a data change, not a policy rewrite.
-- ============================================================

-- Helper: the app user row for the current JWT.
CREATE OR REPLACE FUNCTION public.current_app_user()
RETURNS public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- Helper: is the signed-in user an active member of the workspace?
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND status = 'active'
  );
$$;

-- Helper: does the user have one of these roles?
CREATE OR REPLACE FUNCTION public.has_role(VARIADIC roles public.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role = ANY(roles)
  );
$$;

-- Helper: can the user reach this villa?
-- Today everyone is `global` and this returns true after one short-circuited check.
-- When scoped roles arrive, only this function changes.
CREATE OR REPLACE FUNCTION public.can_access_villa(target_villa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND (
        u.scope = 'global'
        OR EXISTS (
          SELECT 1 FROM public.user_assignments a
          WHERE a.user_id = u.id
            AND (
              (a.scope_type = 'villa' AND a.scope_id = target_villa)
              OR (a.scope_type = 'project' AND a.scope_id = (
                    SELECT v.project_id FROM public.villas v WHERE v.id = target_villa
                  ))
            )
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- Enable RLS everywhere. With RLS on and no policy, the default is DENY.
-- ------------------------------------------------------------
ALTER TABLE public.users                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_assignments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_defaults            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grace_periods                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villas                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villa_customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villa_interest_terms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_schedule_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_stages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_allocations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_credits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_credit_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_logs                ENABLE ROW LEVEL SECURITY;

-- Force RLS for the table owner too, so a mistake in the server layer cannot
-- quietly read everything.
ALTER TABLE public.collections            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.collection_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log              FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- READ: any active user may read workspace data.
-- ------------------------------------------------------------
CREATE POLICY read_users              ON public.users                      FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_assignments        ON public.user_assignments           FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_app_settings       ON public.app_settings               FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_interest_defaults  ON public.interest_defaults          FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_grace_periods      ON public.grace_periods              FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_templates          ON public.reminder_templates         FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_projects           ON public.projects                   FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_customers          ON public.customers                  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY read_schedule_templates ON public.project_schedule_templates FOR SELECT TO authenticated USING (public.is_active_user());

-- Villa-bound tables additionally pass through the scope check.
CREATE POLICY read_villas       ON public.villas               FOR SELECT TO authenticated USING (public.can_access_villa(id));
CREATE POLICY read_villa_cust   ON public.villa_customers      FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_villa_terms  ON public.villa_interest_terms FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_stages       ON public.payment_stages       FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_collections  ON public.collections          FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_credits      ON public.advance_credits      FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_reminders    ON public.reminder_requests    FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));
CREATE POLICY read_documents    ON public.documents            FOR SELECT TO authenticated USING (public.can_access_villa(villa_id));

CREATE POLICY read_allocations ON public.collection_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.collections c WHERE c.id = collection_id AND public.can_access_villa(c.villa_id)));

CREATE POLICY read_credit_apps ON public.advance_credit_applications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.advance_credits ac WHERE ac.id = advance_credit_id AND public.can_access_villa(ac.villa_id)));

CREATE POLICY read_notes ON public.notes FOR SELECT TO authenticated
  USING (public.is_active_user() AND (villa_id IS NULL OR public.can_access_villa(villa_id)));

CREATE POLICY read_activity_events ON public.activity_events FOR SELECT TO authenticated
  USING (public.is_active_user() AND (villa_id IS NULL OR public.can_access_villa(villa_id)));

CREATE POLICY read_reminder_logs ON public.reminder_logs FOR SELECT TO authenticated
  USING (public.is_active_user());

-- Read state is private: a user sees only their own rows, never who else has read what.
CREATE POLICY read_own_notification_reads ON public.notification_reads FOR SELECT TO authenticated
  USING (user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Only Super Admin reads the audit trail.
CREATE POLICY read_audit ON public.audit_log FOR SELECT TO authenticated USING (public.has_role('super_admin'));

-- ------------------------------------------------------------
-- WRITE: no policies.
--
-- Every mutation goes through a Next.js server action using the secret key, which
-- re-checks session and role. Granting INSERT/UPDATE to `authenticated` would let a
-- leaked publishable key write to the ledger directly.
--
-- The absence of a write policy here is deliberate and is the point.
-- ------------------------------------------------------------

-- Nothing is ever hard-deleted. No DELETE policy exists on any table.
