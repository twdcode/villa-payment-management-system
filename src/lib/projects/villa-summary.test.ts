import { describe, expect, it } from "vitest";

import { seedDatabase } from "@/lib/mock/seed-data";
import { deriveVillaSummaries } from "@/lib/projects/villa-summary";

describe("deriveVillaSummaries", () => {
  it("joins a villa to its customer and calculated financial position", () => {
    const villa = deriveVillaSummaries(seedDatabase, "project-ocean").find((summary) => summary.villa.id === "villa-oc-02");

    expect(villa).toMatchObject({
      customer: { fullName: "Nimal Abeysekera" },
      financials: {
        totalValue: 52_000_000,
        principalCollected: 5_000_000,
        outstandingPrincipal: 47_000_000,
        overduePrincipal: 15_000_000,
      },
    });
  });
});
