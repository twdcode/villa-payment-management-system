-- ============================================================
-- Phase 8 — security hardening
-- ============================================================
-- Two defects found by the Phase 8 RLS audit, both verified empirically against a
-- real Postgres before being fixed here.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Views bypassed RLS entirely.
--
-- A Postgres view runs as its OWNER unless `security_invoker` is set. Every view here
-- is owned by the migration role, which owns the tables — so `SELECT` through a view
-- executed with the owner's rights and never evaluated the caller's policies.
--
-- Verified: with Supabase's default table grants in place, both `anon` (not signed in
-- at all) and a DISABLED user holding a still-valid JWT could read
-- `v_villa_position` — outstanding principal, interest, balances — while the same
-- query against the `villas` base table correctly returned zero rows.
--
-- These eight views are where the money lives. `security_invoker = true` makes them
-- evaluate the caller's policies against the underlying tables, so a view can no
-- longer return more than the caller could read directly.
-- ------------------------------------------------------------
ALTER VIEW public.v_live_collections     SET (security_invoker = true);
ALTER VIEW public.v_live_allocations     SET (security_invoker = true);
ALTER VIEW public.v_stage_position       SET (security_invoker = true);
ALTER VIEW public.v_villa_position       SET (security_invoker = true);
ALTER VIEW public.v_project_position     SET (security_invoker = true);
ALTER VIEW public.v_customer_position    SET (security_invoker = true);
ALTER VIEW public.v_ledger_reconciliation SET (security_invoker = true);
ALTER VIEW public.v_receipts             SET (security_invoker = true);

-- ------------------------------------------------------------
-- 2. Revoke the Data API's write grants.
--
-- The migrations never granted anything, so a locally-replayed database looked safe.
-- A real Supabase project is different: it ships `ALTER DEFAULT PRIVILEGES` granting
-- SELECT/INSERT/UPDATE/DELETE on new public tables to `anon` and `authenticated`
-- before our migrations ever run.
--
-- RLS already denies those writes (no write policy exists, which is deliberate — see
-- 0001). This removes the grant as well, so a future `CREATE POLICY` mistake cannot
-- silently open a write path: the grant and the policy would both have to be wrong.
--
-- SELECT is deliberately left in place — the read policies in 0001 are the intended
-- control for reads, and revoking it would make the RLS read policies dead code.
-- ------------------------------------------------------------
-- TRIGGER is included: it lets the grantee attach a trigger to the table, which then
-- runs with the table owner's rights on every write — a real escalation path, not a
-- theoretical one. REFERENCES is lower risk (it only allows a foreign key pointing at
-- the table) but the API roles have no legitimate use for it either.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- The functions in 0005/0007 move money and queue mail. Nothing outside the server
-- layer should be able to invoke them, and PUBLIC gets EXECUTE by default.
REVOKE EXECUTE ON FUNCTION public.record_collection(uuid, uuid, date, numeric, public.payment_method, text, text, uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_collection(uuid, uuid, uuid, date, numeric, public.payment_method, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_due_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_queue_reminder(uuid, uuid, uuid, public.reminder_trigger, date) FROM PUBLIC, anon, authenticated;
