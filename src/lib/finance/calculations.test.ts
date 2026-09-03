import { describe, expect, it } from "vitest";

import { DEFAULT_INTEREST_TERMS, DEMO_TODAY } from "@/lib/config/demo";
import { accruedInterest, allocatePayment, calculateVillaFinancials, paymentStatus } from "@/lib/finance/calculations";
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

    expect(paymentStatus(schedule, DEMO_TODAY)).toBe("overdue");
    expect(accruedInterest(schedule, DEFAULT_INTEREST_TERMS, DEMO_TODAY)).toBe(440_000);
  });

  it("keeps a payment partially paid while it remains inside the grace period", () => {
    const schedule = createSchedule({ dueDate: "2026-08-15", principalPaid: 7_000_000 });

    expect(paymentStatus(schedule, DEMO_TODAY)).toBe("partially_paid");
  });

  it("allocates interest before principal and preserves the remaining principal balance", () => {
    const result = allocatePayment([createSchedule()], 1_000_000, DEFAULT_INTEREST_TERMS, DEMO_TODAY);

    expect(result.interestAmount).toBe(440_000);
    expect(result.principalAmount).toBe(560_000);
    expect(result.advanceCredit).toBe(0);
    expect(result.schedules[0].principalPaid).toBe(5_560_000);
    expect(result.schedules[0].interestPaid).toBe(440_000);
  });

  it("keeps principal and interest totals separate for a villa", () => {
    const totals = calculateVillaFinancials([createSchedule()], DEFAULT_INTEREST_TERMS, DEMO_TODAY);

    expect(totals).toMatchObject({
      totalValue: 20_000_000,
      principalCollected: 5_000_000,
      outstandingPrincipal: 15_000_000,
      overduePrincipal: 15_000_000,
      interestAccrued: 440_000,
      interestCollected: 0,
      interestOutstanding: 440_000,
    });
  });
});
