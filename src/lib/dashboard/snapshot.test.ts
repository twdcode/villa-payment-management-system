import { describe, expect, it } from "vitest";

import { buildDashboardSnapshot } from "@/lib/dashboard/snapshot";
import { seedDatabase } from "@/lib/mock/seed-data";

describe("dashboard snapshot", () => {
  it("calculates portfolio totals from active villa schedules", () => {
    const snapshot = buildDashboardSnapshot(structuredClone(seedDatabase));

    expect(snapshot).toMatchObject({
      totalProjectValue: 423_000_000,
      totalCollected: 182_000_000,
      outstanding: 241_000_000,
      currentlyDue: 24_800_000,
      overdue: 29_400_000,
      interestOutstanding: 968_100,
      overduePaymentCount: 2,
      upcomingPaymentCount: 2,
      finalNoticeCount: 2,
    });
  });

  it("drills down from project to villa without including cancelled villas", () => {
    const project = buildDashboardSnapshot(structuredClone(seedDatabase), { projectId: "project-ocean" });
    const villa = buildDashboardSnapshot(structuredClone(seedDatabase), { projectId: "project-ocean", villaId: "villa-oc-02" });
    const cancelled = buildDashboardSnapshot(structuredClone(seedDatabase), { villaId: "villa-oc-06" });

    expect(project.totalProjectValue).toBe(208_000_000);
    expect(project.scopedVillaCount).toBe(7);
    expect(villa).toMatchObject({ totalProjectValue: 52_000_000, totalCollected: 5_000_000, outstanding: 47_000_000, overdue: 15_000_000 });
    expect(villa.payments.every((payment) => payment.villa.id === "villa-oc-02")).toBe(true);
    expect(cancelled).toMatchObject({ totalProjectValue: 0, totalCollected: 0, outstanding: 0, scopedVillaCount: 0 });
  });

  it("limits latest notes to customers in the selected scope", () => {
    const ocean = buildDashboardSnapshot(structuredClone(seedDatabase), { projectId: "project-ocean" });
    const palm = buildDashboardSnapshot(structuredClone(seedDatabase), { projectId: "project-palm" });

    expect(ocean.customerNotes.map((note) => note.customerName)).toContain("Maya Wijeratne");
    expect(palm.customerNotes).toHaveLength(0);
  });
});
