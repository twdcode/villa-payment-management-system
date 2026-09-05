import { describe, expect, it } from "vitest";

import { seedDatabase } from "@/lib/testing/fixtures";
import { deriveProjectSummaries } from "@/lib/projects/project-summary";

describe("deriveProjectSummaries", () => {
  it("derives the portfolio card values from the fixed demo records", () => {
    const summaries = deriveProjectSummaries(seedDatabase);
    const oceanCrest = summaries.find((summary) => summary.project.id === "project-ocean");
    const serenityBay = summaries.find((summary) => summary.project.id === "project-serenity");

    expect(oceanCrest).toMatchObject({
      villaCount: 8,
      availableVillaCount: 1,
      totalValue: 321_000_000,
      principalCollected: 74_500_000,
      allocationProgress: 23,
    });
    expect(serenityBay).toMatchObject({
      villaCount: 4,
      availableVillaCount: 1,
      totalValue: 125_000_000,
      principalCollected: 97_000_000,
      allocationProgress: 78,
    });
  });
});
