-- ============================================================
-- Keep auth.users and public.users in step
-- ============================================================
-- The role lives in TWO places on purpose:
--   public.users.role     the authority, used by every server-side check
--   app_metadata.role     a copy in the JWT, so the proxy can route without a query
--
-- app_metadata, never user_metadata. Users can write their own user_metadata, which would
-- make becoming a super admin a one-line request.
--
-- This trigger stops the copy drifting: change the row, and the token follows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_role_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', NEW.role, 'user_status', NEW.status)
  WHERE id = NEW.auth_user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_sync_role
AFTER INSERT OR UPDATE OF role, status ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_auth();

-- ------------------------------------------------------------
-- The workspace must never be left without an administrator.
--
-- Enforced in the database, not only in the UI: a server action with a bug, or a direct
-- SQL edit, would otherwise be able to lock everyone out permanently.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_super_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.role = 'super_admin' AND OLD.status = 'active')
     AND (NEW.role <> 'super_admin' OR NEW.status <> 'active')
     AND (SELECT count(*) FROM public.users
          WHERE role = 'super_admin' AND status = 'active' AND id <> OLD.id) = 0
  THEN
    RAISE EXCEPTION 'Cannot demote or disable the last active Super Admin.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_protect_last_super_admin
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_last_super_admin();

-- ------------------------------------------------------------
-- Password state.
--
-- A temporary password set by an admin must be changed on first sign-in. The flag lives
-- in app_metadata so the proxy can read it from the token without a database round trip
-- on every request.
-- ------------------------------------------------------------
COMMENT ON COLUMN public.users.status IS
  'active | disabled. A disabled user keeps their history but cannot sign in.';
