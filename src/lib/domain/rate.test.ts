import { describe, expect, it } from "vitest";

import { isValidRateFraction, percentToRate, rateToPercent } from "@/lib/domain/rate";

describe("rate conversion", () => {
  it("shows a stored fraction as a percent", () => {
    expect(rateToPercent(0.015)).toBe(1.5);
    expect(rateToPercent(0.02)).toBe(2);
  });

  it("stores a typed percent as a fraction", () => {
    expect(percentToRate(1.5)).toBe(0.015);
    expect(percentToRate(2)).toBe(0.02);
  });

  it("round-trips without drift", () => {
    for (const percent of [1.5, 2, 0.75, 1.25, 12.5]) {
      expect(rateToPercent(percentToRate(percent))).toBe(percent);
    }
  });

  it("does not leave floating-point dust", () => {
    // 0.07 * 100 is 7.000000000000001 in raw JS.
    expect(rateToPercent(0.07)).toBe(7);
    expect(percentToRate(0.07)).toBe(0.0007);
  });

  it("accepts fractions and rejects a percent typed into a fraction field", () => {
    expect(isValidRateFraction(0.015)).toBe(true);
    expect(isValidRateFraction(0)).toBe(true);
    // 1.5 here would mean 150% a month — the database CHECK rejects it too.
    expect(isValidRateFraction(1.5)).toBe(false);
    expect(isValidRateFraction(1)).toBe(false);
    expect(isValidRateFraction(-0.01)).toBe(false);
  });
});
