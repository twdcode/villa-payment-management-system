import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Vercel Cron, `08:30 UTC` = `14:00 Asia/Colombo` (see vercel.json). Guarded by
 * `CRON_SECRET` — this is a public URL, and Vercel Cron's own IP is not something to
 * trust as authentication on its own.
 *
 * One step: the daily ledger reconciliation check.
 *
 * This route used to do two other things, both deliberately removed:
 *
 *   - QUEUING moved to the Collections page load. `queue_due_reminders()` is idempotent
 *     and compares dates with `>=`, so opening the approval queue catches up on every
 *     trigger crossed since it was last opened. A queued row does nothing until a human
 *     looks at that page anyway, so a schedule bought nothing.
 *
 *   - SENDING was removed entirely. The PRD makes sending a person's action ("Approve,
 *     edit and send reminders" is a Super Admin capability; Flow 4 ends with the user
 *     sending), and the addendum defines "Save as draft" as storing the review as Ready
 *     to send — a precondition for sending, not the send itself. Dispatching those rows
 *     automatically turned saving a draft into authorising an email, which is the
 *     opposite of a manual-approval workflow. A draft now waits until someone opens it
 *     and presses Send now.
 *
 * Reconciliation stays on a schedule because it genuinely must run when nobody is
 * looking: a ledger discrepancy should raise an alarm on the day it appears, not whenever
 * somebody next happens to open the app.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `v_ledger_reconciliation` returns one row per collection whose allocations plus
  // advance credit do not sum back to the amount received. It must ALWAYS be empty; a
  // single row means the ledger disagrees with itself and money is unaccounted for.
  const reconciliation = await db.execute<{ collection_id: string; discrepancy: string }>(
    sql`SELECT collection_id, discrepancy FROM v_ledger_reconciliation`,
  );

  const body = { reconciliationViolations: reconciliation.length };

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
