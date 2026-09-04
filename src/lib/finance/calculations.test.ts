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
});
