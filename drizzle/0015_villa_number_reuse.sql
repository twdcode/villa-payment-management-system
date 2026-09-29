-- Cancelling a villa must free its number for reuse.
--
-- `completeVillaSetup` already checks for a clash with `isNull(deletedAt)` — a cancelled
-- villa is deliberately not a clash, because the company's own flow is to cancel a villa
-- entered with the wrong figures and re-enter it under the same number. The unique index
-- did not carry the same predicate, so Postgres still saw the soft-deleted row and
-- rejected the insert: the application's validation passed and the write then failed as
-- an opaque 500.
--
-- Making the index partial is what aligns the constraint with the rule the code already
-- enforces. Live rows are unaffected — no (project_id, villa_number) pair is duplicated
-- among rows where deleted_at IS NULL, so every existing villa satisfies the new index.

-- Dropped as a CONSTRAINT, not an index: it was created by a UNIQUE table constraint, so
-- Postgres owns the backing index and refuses a bare DROP INDEX. A partial unique index
-- cannot be expressed as a table constraint at all, which is why the replacement below is
-- a standalone index.
ALTER TABLE public.villas DROP CONSTRAINT IF EXISTS villas_number_per_project;
DROP INDEX IF EXISTS public.villas_number_per_project;

CREATE UNIQUE INDEX villas_number_per_project
  ON public.villas (project_id, villa_number)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.villas_number_per_project IS
  'Villa numbers are unique per project among LIVE villas only. Cancelling a villa frees its number, matching completeVillaSetup''s clash check.';
