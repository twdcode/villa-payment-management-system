-- ============================================================
-- Phase 7: the reminder approval queue and the guard against double-sends.
-- ============================================================

-- O7 — every reminder carries a real company mailbox as Reply-To, stored in workspace
-- settings rather than hardcoded, so a customer hitting reply reaches a person. `From`
-- stays the verified Resend sending domain; only Reply-To is the company address.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS reply_to_email text;

COMMENT ON COLUMN public.app_settings.reply_to_email IS
  'Reply-To on every outgoing reminder (O7). The From address is the verified Resend domain; this is the only per-workspace email setting.';

-- The double-send guard (BACKEND-PLAN step 2 — "UNIQUE (payment_stage_id, reminder_type)").
--
-- "Reminder type" is not the same thing as a template's `type` column: a workspace has
-- exactly one 'overdue' template, but the schedule fires TWO separate overdue reminders
-- (first_reminder_day and second_reminder_day) from that one template. Uniquing on
-- (stage, template) would treat those as the same event and silently drop the second one.
-- `reminder_trigger` names the SCHEDULE EVENT that queued the row, independent of which
-- template supplied the wording.
CREATE TYPE public.reminder_trigger AS ENUM (
  'upcoming', 'overdue_first', 'overdue_second', 'final_notice'
);

ALTER TABLE public.reminder_requests
  ADD COLUMN IF NOT EXISTS trigger public.reminder_trigger;

COMMENT ON COLUMN public.reminder_requests.trigger IS
  'Which schedule event queued this row (BACKEND-PLAN step 2''s "reminder_type"). NULL for user-initiated requests, which have no schedule trigger and are exempt from the once-per-stage rule.';

-- Scoped to LIVE, SYSTEM-QUEUED requests only: a cancelled or already-sent request must
-- not block a fresh one for the same stage and trigger, and a user manually preparing a
-- reminder from a collection row must never be blocked by an unrelated system trigger.
CREATE UNIQUE INDEX IF NOT EXISTS reminder_requests_one_live_per_stage_trigger
  ON public.reminder_requests (payment_stage_id, trigger)
  WHERE status IN ('awaiting_approval', 'ready_to_send')
    AND origin = 'system'
    AND payment_stage_id IS NOT NULL
    AND trigger IS NOT NULL;

COMMENT ON INDEX public.reminder_requests_one_live_per_stage_trigger IS
  'Blocks the cron job from queuing a second system reminder for the same stage and trigger while one is already awaiting approval or ready to send.';
