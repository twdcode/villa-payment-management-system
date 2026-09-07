import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { sendReminderEmail } from "@/lib/reminders/send";

/**
 * Vercel Cron, `08:30 UTC` = `14:00 Asia/Colombo` (see vercel.json). Guarded by
 * `CRON_SECRET` — this is a public URL, and Vercel Cron's own IP is not something to
 * trust as authentication on its own.
 *
 * Three steps, in order, matching `DEVELOPMENT-PHASES.md` Phase 7:
 *   1. Queue new reminder_requests for every schedule trigger crossed (idempotent —
 *      `queue_due_reminders()` in `drizzle/0007_reminder_cron.sql` relies on the unique
 *      index in 0006 and never double-queues)
 *   2. Send everything a human has already approved (`status = 'ready_to_send'`) — the
 *      cron dispatches, it does not decide to send; that decision is `reviewReminderApproval`
 *   3. Reconciliation: read `v_ledger_reconciliation`, which must always be empty
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [queueResult] = await db.execute<{ queued_count: number; skipped_no_template: number }>(
    sql`SELECT * FROM public.queue_due_reminders()`,
  );

  const readyToSend = await db.select().from(schema.reminderRequests).where(eq(schema.reminderRequests.status, "ready_to_send"));
  let sent = 0;
  let failed = 0;
  for (const request of readyToSend) {
    try {
      // Mark sent only after the send call succeeds — marking it first and rolling back
      // on failure would leave a request that looks sent (`sentAt` set) with a delivery
      // error attached, an internally contradictory state.
      await sendReminderEmail(request);
      await db.update(schema.reminderRequests).set({ status: "sent", sentAt: new Date() }).where(eq(schema.reminderRequests.id, request.id));
      sent += 1;
    } catch (error) {
      failed += 1;
      // The request keeps `status = 'ready_to_send'` so the next run retries it. Only
      // the delivery fields change — a failed send must never look sent.
      await db.update(schema.reminderRequests).set({
        deliveryStatus: "failed",
        deliveryError: error instanceof Error ? error.message : "Unknown error",
      }).where(eq(schema.reminderRequests.id, request.id));
      console.error(`[cron/reminders] send failed for request ${request.id}:`, error);
    }
  }

  // Phase 8 daily reconciliation alert. `v_ledger_reconciliation` returns one row per
  // collection whose allocations plus advance credit do not sum back to the amount
  // received. It must ALWAYS be empty; a single row means the ledger disagrees with
  // itself and money is unaccounted for.
  const reconciliation = await db.execute<{ collection_id: string; discrepancy: string }>(sql`SELECT collection_id, discrepancy FROM v_ledger_reconciliation`);

  const body = {
    queued: queueResult.queued_count,
    skippedNoTemplate: queueResult.skipped_no_template,
    sent,
    failed,
    reconciliationViolations: reconciliation.length,
  };

  if (reconciliation.length > 0) {
    // Return 500 so the run shows as FAILED in Vercel's cron dashboard and triggers its
    // alerting. Returning 200 with a count in the body would leave a ledger discrepancy
    // sitting silently in a log nobody reads.
    console.error(
      `[cron/reminders] LEDGER RECONCILIATION FAILED — ${reconciliation.length} collection(s) do not balance:`,
      reconciliation.map((row) => `${row.collection_id} (off by ${row.discrepancy})`).join(", "),
    );
    return NextResponse.json({ ...body, error: "Ledger reconciliation failed" }, { status: 500 });
  }

  return NextResponse.json(body);
}
