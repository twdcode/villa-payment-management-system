-- ============================================================
-- One system reminder per stage + trigger, for good.
-- ============================================================
-- `reminder_requests_one_live_per_stage_trigger` (0006) only covered LIVE rows —
-- `awaiting_approval` and `ready_to_send`. Once a reminder was sent, the same stage and
-- trigger became eligible again.
--
-- Under the nightly cron that produced at most one repeat per day, which was already
-- wrong but slow enough to go unnoticed. Queuing now runs when the Collections page is
-- opened, so the same reminder could re-queue on every page load for as long as the stage
-- stayed unpaid — villa 02 accumulated three sent `overdue_first` rows plus a fourth
-- awaiting approval this way. Approval still gated every send, so no customer was
-- spammed, but the queue filled with duplicates a Super Admin had to dismiss repeatedly.
--
-- A trigger is a POINT IN TIME ("14 days past grace"), not a recurring state, so crossing
-- it should produce exactly one reminder ever. Escalation is what the separate
-- `overdue_second` and `final_notice` triggers are for.
--
-- `cancelled` stays outside the index deliberately: it is only ever set when a villa
-- programme is cancelled, and `queue_due_reminders()` already skips non-active villas, so
-- including it would guard a case that cannot arise while suggesting it can.
-- ============================================================

DROP INDEX IF EXISTS public.reminder_requests_one_live_per_stage_trigger;

-- Collapse duplicates the old index allowed through, so the stricter one can be created.
-- Keeps the most meaningful row per (stage, trigger): a sent reminder is a fact about the
-- customer and outranks anything still pending, and among equals the earliest is the one
-- that actually represents the trigger being crossed.
CREATE TEMP TABLE reminder_dupes AS
SELECT id,
       FIRST_VALUE(id) OVER (
         PARTITION BY payment_stage_id, trigger
         ORDER BY (status = 'sent') DESC, requested_at
       ) AS keep_id,
       ROW_NUMBER() OVER (
         PARTITION BY payment_stage_id, trigger
         ORDER BY (status = 'sent') DESC, requested_at
       ) AS rank
FROM public.reminder_requests
WHERE origin = 'system'
  AND payment_stage_id IS NOT NULL
  AND trigger IS NOT NULL
  AND status IN ('awaiting_approval', 'ready_to_send', 'sent');

-- Delivery logs move to the surviving row rather than being deleted with the duplicate.
-- Each one records a real email that reached a customer, with its provider message id —
-- evidence of contact that must not disappear just because the request rows are being
-- deduplicated.
UPDATE public.reminder_logs l
SET reminder_request_id = d.keep_id
FROM reminder_dupes d
WHERE l.reminder_request_id = d.id AND d.rank > 1;

DELETE FROM public.reminder_requests r
USING reminder_dupes d
WHERE r.id = d.id AND d.rank > 1;

DROP TABLE reminder_dupes;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_requests_one_per_stage_trigger
  ON public.reminder_requests (payment_stage_id, trigger)
  WHERE status IN ('awaiting_approval', 'ready_to_send', 'sent')
    AND origin = 'system'
    AND payment_stage_id IS NOT NULL
    AND trigger IS NOT NULL;

COMMENT ON INDEX public.reminder_requests_one_per_stage_trigger IS
  'One system reminder per payment stage per trigger, including after it is sent. A schedule trigger is a moment crossed once, not a recurring state — escalation uses the later triggers instead.';

-- ------------------------------------------------------------
-- The ON CONFLICT inference predicate must match the index above verbatim: Postgres
-- compares normalised expression trees, so a predicate that no longer matches any index
-- makes the INSERT raise "no unique or exclusion constraint matching the ON CONFLICT
-- specification" instead of quietly skipping. Only that predicate changes here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_queue_reminder(
  p_stage_id     uuid,
  p_villa_id     uuid,
  p_customer_id  uuid,
  p_trigger      public.reminder_trigger,
  p_send_date    date
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_template_type public.template_type;
  v_template_id   uuid;
  v_subject       text;
  v_message       text;
  v_inserted_id   uuid;
BEGIN
  v_template_type := CASE p_trigger
    WHEN 'upcoming' THEN 'upcoming'
    WHEN 'overdue_first' THEN 'overdue'
    WHEN 'overdue_second' THEN 'overdue'
    WHEN 'final_notice' THEN 'final_notice'
  END;

  SELECT id, subject, message INTO v_template_id, v_subject, v_message
  FROM public.reminder_templates
  WHERE type = v_template_type AND is_active AND deleted_at IS NULL
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.reminder_requests (
    villa_id, customer_id, payment_stage_id, template_id, origin, trigger, status,
    send_date, subject, message
  ) VALUES (
    p_villa_id, p_customer_id, p_stage_id, v_template_id, 'system', p_trigger, 'awaiting_approval',
    p_send_date, v_subject, v_message
  )
  ON CONFLICT (payment_stage_id, trigger)
    WHERE status = ANY (ARRAY['awaiting_approval', 'ready_to_send', 'sent']::public.reminder_status[])
      AND origin = 'system' AND payment_stage_id IS NOT NULL AND trigger IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  RETURN CASE WHEN v_inserted_id IS NOT NULL THEN 1 ELSE 0 END;
END;
$$;
