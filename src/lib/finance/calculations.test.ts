import { describe, expect, it } from "vitest";

import { DEFAULT_INTEREST_TERMS, DEMO_TODAY } from "@/lib/config/demo";
import { accruedInterest, allocatePayment, calculateVillaFinancials, interestOutstanding, paymentStatus, totalOutstanding } from "@/lib/finance/calculations";
import type { PaymentSchedule } from "@/lib/domain/types";

function createSchedule(overrides: Partial<PaymentSchedule> = {}): PaymentSchedule {
  return {
    id: "schedule-test",
    villaId: "villa-test",
    stage: "Reservation",
    dueDate: "2026-06-15",
    gracePeriodDays: 30,
    principalAmount: 20_000_000,
    principalPaid: 5_000_000,
    interestAccrued: 0,
    interestPaid: 0,
    status: "overdue",
    ...overrides,
  };
}

describe("payment schedule calculations", () => {
  it("uses the fixed demo date and grace period to identify overdue balances", () => {
    const schedule = createSchedule();

    // Due 15 Jun + 30 days grace = 15 Jul. To 28 Aug is 44 chargeable days.
    // 15,000,000 outstanding x 0.015 x 44 / 30 = 330,000
    expect(paymentStatus(schedule, DEMO_TODAY)).toBe("overdue");
    expect(accruedInterest(schedule, DEFAULT_INTEREST_TERMS, DEMO_TODAY)).toBe(330_000);
  });

  it("keeps a payment partially paid while it remains inside the grace period", () => {
    const schedule = createSchedule({ dueDate: "2026-08-15", principalPaid: 7_000_000 });

    expect(paymentStatus(schedule, DEMO_TODAY)).toBe("partially_paid");
  });

  it("allocates interest before principal and preserves the remaining principal balance", () => {
    const result = allocatePayment([createSchedule()], 1_000_000, DEFAULT_INTEREST_TERMS, DEMO_TODAY);

    // Interest first: 330,000 of the 1,000,000, leaving 670,000 for principal.
    expect(result.interestAmount).toBe(330_000);
    expect(result.principalAmount).toBe(670_000);
    expect(result.advanceCredit).toBe(0);
    expect(result.schedules[0].principalPaid).toBe(5_670_000);
    expect(result.schedules[0].interestPaid).toBe(330_000);
  });

  it("keeps principal and interest totals separate for a villa", () => {
    const totals = calculateVillaFinancials([createSchedule()], DEFAULT_INTEREST_TERMS, DEMO_TODAY);

    expect(totals).toMatchObject({
      totalValue: 20_000_000,
      principalCollected: 5_000_000,
      outstandingPrincipal: 15_000_000,
      overduePrincipal: 15_000_000,
      interestAccrued: 330_000,
      interestCollected: 0,
      interestOutstanding: 330_000,
    });
  });
});

describe("outstanding helpers", () => {
  it("nets interest paid against interest accrued", () => {
    const schedule = createSchedule({ interestAccrued: 50_000, interestPaid: 20_000 });
    expect(interestOutstanding(schedule)).toBe(30_000);
  });

  it("never returns a negative balance when overpaid", () => {
    const schedule = createSchedule({ interestAccrued: 10_000, interestPaid: 15_000 });
    expect(interestOutstanding(schedule)).toBe(0);
  });

  it("totals principal and interest still owed", () => {
    const schedule = createSchedule({
      principalAmount: 20_000_000,
      principalPaid: 5_000_000,
      interestAccrued: 50_000,
      interestPaid: 20_000,
    });
    expect(totalOutstanding(schedule)).toBe(15_030_000);
  });

  /**
   * Regression: interest must keep accruing after a partial payment.
   *
   * The old model recomputed interest as `outstanding x rate x days-since-grace-end` on
   * every read. Once a payment reduced the principal, that applied the smaller balance to
   * days when the balance had been larger, producing a total below what the customer had
   * already paid — which then clamped to zero. Interest silently stopped accruing for
   * weeks and the company under-charged. Verified in Postgres too; see
   * `drizzle/0004_interest_accrual.sql`.
   */
  it("keeps charging interest on the reduced balance after a partial payment", () => {
    // 10,000,000 due 01 Jan, 15-day grace -> grace ends 16 Jan.
    const stage = createSchedule({
      dueDate: "2026-01-01",
      gracePeriodDays: 15,
      principalAmount: 10_000_000,
      principalPaid: 0,
    });

    // At 15 Feb: 30 chargeable days. 10,000,000 x 1.5% x 30/30 = 150,000.
    expect(accruedInterest(stage, DEFAULT_INTEREST_TERMS, "2026-02-15")).toBe(150_000);

    // Pay the interest plus 5,000,000 of principal.
    const paid = allocatePayment([stage], 5_150_000, DEFAULT_INTEREST_TERMS, "2026-02-15");
    const after = paid.schedules[0];
    expect(paid.interestAmount).toBe(150_000);
    expect(after.principalPaid).toBe(5_000_000);
    // The charge is now a recorded fact, anchored to the payment date.
    expect(after.interestCharged).toBe(150_000);
    expect(after.interestChargedTo).toBe("2026-02-15");
    // Nothing outstanding the instant it is paid.
    expect(interestOutstanding(after)).toBe(0);

    // 30 days on, 5,000,000 still owed: 5,000,000 x 1.5% x 30/30 = 75,000.
    // The old model reported 0 here.
    expect(accruedInterest(after, DEFAULT_INTEREST_TERMS, "2026-03-17")).toBe(225_000);
    expect(interestOutstanding({ ...after, interestAccrued: accruedInterest(after, DEFAULT_INTEREST_TERMS, "2026-03-17") })).toBe(75_000);
  });

  it("never charges interest for days inside the grace period", () => {
    const stage = createSchedule({ dueDate: "2026-08-20", gracePeriodDays: 15, principalAmount: 4_000_000, principalPaid: 0 });
    // Grace ends 04 Sep; valuing at 28 Aug is still inside it (E3).
    expect(accruedInterest(stage, DEFAULT_INTEREST_TERMS, DEMO_TODAY)).toBe(0);
    expect(paymentStatus(stage, DEMO_TODAY)).toBe("due");
  });
});
