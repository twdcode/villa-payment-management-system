-- ============================================================
-- A reminder cancelled by a reviewer records WHY, in its own column.
-- ============================================================
-- Cancelling was first written to reuse `delivery_error`, because both are free text
-- attached to a reminder that did not reach the customer. They are different facts:
-- `delivery_error` is what the mail provider said went wrong, while this is a person's
-- decision not to chase someone. Mixing them means a failed send and a deliberate
-- cancellation are indistinguishable afterwards, and any future "retry failed sends" job
-- would treat cancelled rows as delivery problems.
-- ============================================================

ALTER TABLE public.reminder_requests
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.reminder_requests.rejection_reason IS
  'Why a reviewer cancelled this reminder rather than sending it. Distinct from delivery_error, which records a provider failure.';

-- Move the reasons written before this column existed.
UPDATE public.reminder_requests
SET rejection_reason = delivery_error, delivery_error = NULL
WHERE status = 'cancelled' AND delivery_error IS NOT NULL AND rejection_reason IS NULL;
