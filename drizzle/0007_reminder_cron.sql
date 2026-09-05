-- ============================================================
-- Phase 7: the cron job's queue step.
-- ============================================================
-- `queue_due_reminders()` scans overdue stages and inserts a `reminder_requests` row for
-- each schedule trigger that has been crossed and has no live request yet. Meant to run
-- once a day; running it twice, or catching up after a missed day, must never create a
-- duplicate — that is what 0006's unique index on (payment_stage_id, trigger) enforces.
--
-- Triggers mirror `scheduleCandidates()` in notification-centre.ts, because the queue must
-- fire on the same days the on-screen alert already appears — a customer should never get
-- an email for a state the dashboard was not already showing:
--
--   upcoming         7 days before due_date, until due_date
--   overdue_first    first_reminder_day days after grace ends
--   overdue_second   second_reminder_day days after grace ends — a distinct trigger, so
--                    it is never blocked by overdue_first even though both may use the
--                    same 'overdue' template
--   final_notice     final_notice_day days after grace ends
--
-- `>=` not `=` on every date comparison (BACKEND-PLAN step 5): if the cron misses a day,
-- the next run still queues everything that fell due in the gap.
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_due_reminders()
RETURNS TABLE (queued_count integer, skipped_no_template integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_today    date := public.workspace_today();
  v_stage    RECORD;
  v_queued   integer := 0;
  v_skipped  integer := 0;
  v_result   integer;
BEGIN
  FOR v_stage IN
    SELECT
      s.id AS stage_id,
      s.villa_id,
      vc.customer_id,
      (s.due_date + s.grace_period_days * INTERVAL '1 day')::date AS grace_ends_on,
      s.due_date,
      COALESCE(t.first_reminder_day,  d.first_reminder_day)  AS first_reminder_day,
      COALESCE(t.second_reminder_day, d.second_reminder_day) AS second_reminder_day,
      COALESCE(t.final_notice_day,    d.final_notice_day)    AS final_notice_day
    FROM public.payment_stages s
    JOIN public.villas v ON v.id = s.villa_id AND v.programme_status = 'active' AND v.deleted_at IS NULL
    JOIN public.villa_customers vc ON vc.villa_id = s.villa_id AND vc.unassigned_at IS NULL
    LEFT JOIN public.villa_interest_terms t ON t.villa_id = s.villa_id
    CROSS JOIN public.interest_defaults d
    LEFT JOIN (
      SELECT payment_stage_id, SUM(principal_amount) AS principal_paid
      FROM public.v_live_allocations GROUP BY payment_stage_id
    ) paid ON paid.payment_stage_id = s.id
    WHERE s.due_date IS NOT NULL AND s.principal_amount > 0
      AND (s.principal_amount - COALESCE(paid.principal_paid, 0)) > 0
  LOOP
    IF v_today >= v_stage.due_date - 7 AND v_today < v_stage.due_date THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'upcoming', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.first_reminder_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'overdue_first', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.second_reminder_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'overdue_second', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;

    IF v_today >= v_stage.grace_ends_on + v_stage.final_notice_day THEN
      SELECT public.try_queue_reminder(v_stage.stage_id, v_stage.villa_id, v_stage.customer_id, 'final_notice', v_today) INTO v_result;
      IF v_result IS NULL THEN v_skipped := v_skipped + 1; ELSE v_queued := v_queued + v_result; END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_queued, v_skipped;
END;
$$;

COMMENT ON FUNCTION public.queue_due_reminders IS
  'Cron step 1: queue system reminder_requests for every schedule trigger crossed today or earlier. Idempotent — relies on the unique index in 0006, never inserts a duplicate live request.';

-- ------------------------------------------------------------
-- Insert one reminder request for a trigger, using the workspace's active template of the
-- matching type. Returns 1 if inserted, 0 if one already existed, NULL if there is no
-- active template of that type to send (nothing to queue until one is configured).
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

  -- RETURNING into a variable, not FOUND: FOUND after INSERT ... ON CONFLICT DO NOTHING
  -- reflects whether the INSERT statement ran, not whether a row landed, so it cannot
  -- tell a real insert apart from a skipped conflict.
  --
  -- The inference predicate must match the partial index in 0006 verbatim — Postgres
  -- compares normalised expression trees, and ANY(ARRAY[...]) is not the same tree as
  -- IN (...) even though they are semantically identical.
  INSERT INTO public.reminder_requests (
    villa_id, customer_id, payment_stage_id, template_id, origin, trigger, status,
    send_date, subject, message
  ) VALUES (
    p_villa_id, p_customer_id, p_stage_id, v_template_id, 'system', p_trigger, 'awaiting_approval',
    p_send_date, v_subject, v_message
  )
  ON CONFLICT (payment_stage_id, trigger)
    WHERE status = ANY (ARRAY['awaiting_approval', 'ready_to_send']::public.reminder_status[])
      AND origin = 'system' AND payment_stage_id IS NOT NULL AND trigger IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  RETURN CASE WHEN v_inserted_id IS NOT NULL THEN 1 ELSE 0 END;
END;
$$;

COMMENT ON FUNCTION public.try_queue_reminder IS
  'Inserts one reminder_requests row for a schedule trigger, using the workspace''s active template of the matching type. NULL if no such template exists; 0 if a live request already exists for this stage+trigger (the 0006 unique index); 1 if inserted.';
