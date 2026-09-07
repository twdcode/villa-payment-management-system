import type { Collection, MockDatabase, PaymentSchedule, PaymentStatus } from "@/lib/domain/types";
import { isPaymentScheduleReady, paymentStatus, principalOutstanding } from "@/lib/finance/calculations";
import { isVillaActive } from "@/lib/domain/villa-status";

/**
 * Anything the Collections table can show, in one shape.
 *
 * The page used to list `collections` alone — money already received — which put
 * "Prepare reminder" exclusively on rows for customers who had *already paid*. The people
 * who actually need chasing had no row at all. The PRD's row fields say "Due **or**
 * payment date" and split row actions between "paid collection" and "unpaid/scheduled
 * payment", so both belong here.
 *
 * A partly-paid installment produces BOTH kinds: one `payment` row per receipt, plus an
 * `installment` row carrying whatever is still outstanding. The amounts sum back to the
 * installment total, and the outstanding row is the one staff can act on.
 */
export type CollectionRowStatus = PaymentStatus | "confirmed" | "superseded" | "due_soon";

export type CollectionRow = {
  id: string;
  kind: "installment" | "payment";
  projectId: string;
  villaId: string;
  customerId: string;
  /** Sorts the table. The installment's due date for both kinds, so a receipt sits with the stage it paid. */
  dueDate: string;
  /** Only a `payment` row has one — an unpaid installment has not been paid on any date. */
  paymentDate?: string;
  scheduleId?: string;
  stage?: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  status: CollectionRowStatus;
  collection?: Collection;
};

/** Business rule, not the grace period: how far ahead counts as "coming up". */
export const DUE_SOON_DAYS = 60;

function daysUntil(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Splits `not_due` into "Scheduled" and "Next 60 days".
 *
 * `paymentStatus()` deliberately knows nothing about the 60-day window — that is a display
 * concern, and baking it into the finance layer would make every financial total depend on
 * a presentation rule.
 */
function displayStatus(schedule: PaymentSchedule, today: string): CollectionRowStatus {
  const status = paymentStatus(schedule, today);
  if (status !== "not_due") return status;
  return daysUntil(today, schedule.dueDate) <= DUE_SOON_DAYS ? "due_soon" : "not_due";
}

/**
 * Every row for the Collections table, newest due date first.
 *
 * Cancelled villas are excluded to match the addendum: cancelling a programme removes its
 * schedules and collections from operational views while leaving villa history intact.
 */
export function buildCollectionRows(database: MockDatabase): CollectionRow[] {
  const villas = new Map(database.villas.map((villa) => [villa.id, villa]));
  const schedules = new Map(database.schedules.map((schedule) => [schedule.id, schedule]));
  const rows: CollectionRow[] = [];

  for (const collection of database.collections) {
    const villa = villas.get(collection.villaId);
    if (!villa || !isVillaActive(villa)) continue;
    // Which stage this receipt paid. Oldest-first allocation means a payment can span
    // several; the earliest is the one it belongs beside in a table sorted by due date.
    const paidSchedule = collection.allocations
      .map((allocation) => schedules.get(allocation.scheduleId))
      .filter((schedule): schedule is PaymentSchedule => Boolean(schedule))
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
    rows.push({
      id: collection.id,
      kind: "payment",
      projectId: collection.projectId,
      villaId: collection.villaId,
      customerId: collection.customerId,
      dueDate: paidSchedule?.dueDate ?? collection.paymentDate,
      paymentDate: collection.paymentDate,
      scheduleId: paidSchedule?.id,
      stage: paidSchedule?.stage,
      principalAmount: collection.principalAmount,
      interestAmount: collection.interestAmount,
      totalAmount: collection.totalAmount,
      status: collection.status,
      collection,
    });
  }

  for (const schedule of database.schedules) {
    const villa = villas.get(schedule.villaId);
    if (!villa || !isVillaActive(villa) || !villa.customerId) continue;
    if (!isPaymentScheduleReady(schedule)) continue;
    const outstanding = principalOutstanding(schedule);
    // Settled stages are represented by their payment rows; a zero-value row would only
    // duplicate money already shown.
    if (outstanding === 0) continue;
    const interest = Math.max(0, schedule.interestAccrued - schedule.interestPaid);
    rows.push({
      id: `schedule-${schedule.id}`,
      kind: "installment",
      projectId: villa.projectId,
      villaId: schedule.villaId,
      customerId: villa.customerId,
      dueDate: schedule.dueDate,
      scheduleId: schedule.id,
      stage: schedule.stage,
      principalAmount: outstanding,
      interestAmount: interest,
      totalAmount: outstanding + interest,
      status: displayStatus(schedule, database.today),
    });
  }

  return rows.sort((left, right) => right.dueDate.localeCompare(left.dueDate) || left.kind.localeCompare(right.kind));
}
