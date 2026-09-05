import type { AllocationOrder, InterestTerms, PaymentSchedule, PaymentStatus, VillaFinancials } from "@/lib/domain/types";

const DAY_IN_MS = 86_400_000;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asUtcDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number) {
  const result = asUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.max(0, Math.floor((asUtcDate(endDate).getTime() - asUtcDate(startDate).getTime()) / DAY_IN_MS));
}

export function principalOutstanding(schedule: PaymentSchedule) {
  return roundMoney(Math.max(0, schedule.principalAmount - schedule.principalPaid));
}

/** Interest charged on a stage but not yet paid. */
export function interestOutstanding(schedule: PaymentSchedule) {
  return roundMoney(Math.max(0, schedule.interestAccrued - schedule.interestPaid));
}

/** Everything still owed on a stage: principal plus unpaid interest. */
export function totalOutstanding(schedule: PaymentSchedule) {
  return roundMoney(principalOutstanding(schedule) + interestOutstanding(schedule));
}

export function isPaymentScheduleReady(schedule: PaymentSchedule) {
  return Boolean(schedule.stage.trim()) && Boolean(schedule.dueDate) && schedule.principalAmount > 0 && schedule.gracePeriodDays >= 0;
}

export function paymentStatus(schedule: PaymentSchedule, today: string): PaymentStatus {
  if (!isPaymentScheduleReady(schedule)) return "not_due";
  const outstanding = principalOutstanding(schedule);
  if (outstanding === 0) return "paid";

  const graceEnd = addDays(schedule.dueDate, schedule.gracePeriodDays);
  if (today > graceEnd) return "overdue";
  if (schedule.principalPaid > 0) return "partially_paid";
  if (today >= schedule.dueDate) return "due";
  return "not_due";
}

export function overdueDays(schedule: PaymentSchedule, today: string) {
  if (!isPaymentScheduleReady(schedule)) return 0;
  const graceEnd = addDays(schedule.dueDate, schedule.gracePeriodDays);
  return today > graceEnd ? daysBetween(graceEnd, today) : 0;
}

/**
 * The date interest has already been charged up to — the point new accrual starts from.
 *
 * Falls back to grace-end (or the due date, under `from_due_date`) when nothing has been
 * charged yet. Never earlier than that start, so an anchor cannot reach back and create
 * interest for days inside the grace period.
 */
function accrualStart(schedule: PaymentSchedule, terms: InterestTerms) {
  const start = terms.interestStart === "from_due_date"
    ? schedule.dueDate
    : addDays(schedule.dueDate, schedule.gracePeriodDays);
  const anchor = schedule.interestChargedTo;
  return anchor && anchor > start ? anchor : start;
}

/**
 * Total interest on a stage: what has already been CHARGED, plus accrual over the days
 * since. Mirrors `v_stage_position` in `drizzle/0004_interest_accrual.sql` exactly — the
 * two must agree, because from Phase 6 the server's figure is the one that gets stored
 * and this becomes preview-only (C8).
 *
 * The charged portion is a stored fact and is never recomputed. Recomputing it was the
 * bug: after a partial payment the formula applied the reduced balance to days when the
 * balance was higher, producing a figure below what the customer had already paid, which
 * then clamped to zero and stalled accrual for weeks.
 */
export function accruedInterest(schedule: PaymentSchedule, terms: InterestTerms, today: string) {
  if (!isPaymentScheduleReady(schedule)) return 0;
  const charged = schedule.interestCharged ?? 0;
  const days = daysBetween(accrualStart(schedule, terms), today);
  const overduePrincipal = principalOutstanding(schedule);
  return roundMoney(charged + overduePrincipal * terms.monthlyRate * days / terms.proRataDivisor);
}

export type AllocationResult = {
  schedules: PaymentSchedule[];
  allocations: Array<{ scheduleId: string; principalAmount: number; interestAmount: number }>;
  principalAmount: number;
  interestAmount: number;
  advanceCredit: number;
};

export function allocatePayment(
  schedules: PaymentSchedule[],
  amount: number,
  terms: InterestTerms,
  today: string,
  allocationOrder: AllocationOrder = terms.allocationOrder,
): AllocationResult {
  let remaining = roundMoney(amount);
  let totalPrincipal = 0;
  let totalInterest = 0;
  const allocations: AllocationResult["allocations"] = [];
  const updatedSchedules = schedules
    .filter(isPaymentScheduleReady)
    .map((schedule) => ({ ...schedule }))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

  for (const schedule of updatedSchedules) {
    if (remaining <= 0 || principalOutstanding(schedule) === 0) continue;

    // Charge interest up to the payment date and freeze it. `accruedInterest` already
    // includes everything charged before, so this is the running total, not an increment.
    // No Math.max clamp: the figure can only grow, so a clamp would only ever hide a bug.
    const liveInterest = accruedInterest(schedule, terms, today);
    schedule.interestAccrued = liveInterest;
    schedule.interestCharged = liveInterest;
    schedule.interestChargedTo = today;
    const interestOutstanding = roundMoney(Math.max(0, schedule.interestAccrued - schedule.interestPaid));
    const principalDue = principalOutstanding(schedule);
    let interestAmount = 0;
    let principalAmount = 0;

    if (allocationOrder === "interest_first") {
      interestAmount = Math.min(remaining, interestOutstanding);
      remaining = roundMoney(remaining - interestAmount);
      principalAmount = Math.min(remaining, principalDue);
      remaining = roundMoney(remaining - principalAmount);
    } else {
      principalAmount = Math.min(remaining, principalDue);
      remaining = roundMoney(remaining - principalAmount);
      interestAmount = Math.min(remaining, interestOutstanding);
      remaining = roundMoney(remaining - interestAmount);
    }

    schedule.principalPaid = roundMoney(schedule.principalPaid + principalAmount);
    schedule.interestPaid = roundMoney(schedule.interestPaid + interestAmount);
    schedule.status = paymentStatus(schedule, today);
    totalPrincipal = roundMoney(totalPrincipal + principalAmount);
    totalInterest = roundMoney(totalInterest + interestAmount);

    if (principalAmount > 0 || interestAmount > 0) {
      allocations.push({ scheduleId: schedule.id, principalAmount, interestAmount });
    }
  }

  return { schedules: updatedSchedules, allocations, principalAmount: totalPrincipal, interestAmount: totalInterest, advanceCredit: remaining };
}

export function calculateVillaFinancials(schedules: PaymentSchedule[], terms: InterestTerms, today: string): VillaFinancials {
  return schedules.reduce<VillaFinancials>(
    (totals, schedule) => {
      const outstanding = principalOutstanding(schedule);
      // `accruedInterest` now already includes the charged portion, so it is never below
      // the stored figure — the old Math.max was papering over the two disagreeing.
      const interest = accruedInterest(schedule, terms, today);
      return {
        totalValue: roundMoney(totals.totalValue + schedule.principalAmount),
        principalCollected: roundMoney(totals.principalCollected + schedule.principalPaid),
        outstandingPrincipal: roundMoney(totals.outstandingPrincipal + outstanding),
        overduePrincipal: roundMoney(totals.overduePrincipal + (paymentStatus(schedule, today) === "overdue" ? outstanding : 0)),
        interestAccrued: roundMoney(totals.interestAccrued + interest),
        interestCollected: roundMoney(totals.interestCollected + schedule.interestPaid),
        interestOutstanding: roundMoney(totals.interestOutstanding + Math.max(0, interest - schedule.interestPaid)),
      };
    },
    { totalValue: 0, principalCollected: 0, outstandingPrincipal: 0, overduePrincipal: 0, interestAccrued: 0, interestCollected: 0, interestOutstanding: 0 },
  );
}
