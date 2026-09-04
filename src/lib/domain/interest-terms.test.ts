import { describe, expect, it } from "vitest";

import { DEFAULT_INTEREST_TERMS } from "@/lib/config/demo";
import { resolveInterestTerms, storedInterestTerms } from "@/lib/domain/interest-terms";
import type { Villa } from "@/lib/domain/types";

const settings = { defaultInterestTerms: DEFAULT_INTEREST_TERMS };
const villa = (overrides: Partial<Villa>) => overrides as Villa;

describe("resolveInterestTerms", () => {
  it("uses the workspace defaults when the villa overrides nothing", () => {
    expect(resolveInterestTerms(settings, villa({}))).toEqual(DEFAULT_INTEREST_TERMS);
  });

  it("lets a villa override a single term without losing the others", () => {
    const result = resolveInterestTerms(settings, villa({ interestTerms: { monthlyRate: 0.015 } }));
    expect(result.monthlyRate).toBe(0.015);
    expect(result.proRataDivisor).toBe(DEFAULT_INTEREST_TERMS.proRataDivisor);
  });

  it("zeroes the rate when the villa has interest switched off", () => {
    expect(resolveInterestTerms(settings, villa({ chargeLatePaymentInterest: false })).monthlyRate).toBe(0);
  });

  it("zeroes the rate even when the villa also overrides it", () => {
    // The regression: an override must not resurrect interest that is switched off.
    const result = resolveInterestTerms(
      settings,
      villa({ chargeLatePaymentInterest: false, interestTerms: { monthlyRate: 0.05 } }),
    );
    expect(result.monthlyRate).toBe(0);
  });

  it("keeps the rate when interest is explicitly switched on", () => {
    const result = resolveInterestTerms(settings, villa({ chargeLatePaymentInterest: true }));
    expect(result.monthlyRate).toBe(DEFAULT_INTEREST_TERMS.monthlyRate);
  });

  it("treats an undefined villa as defaults, for screens with nothing selected yet", () => {
    expect(resolveInterestTerms(settings, undefined)).toEqual(DEFAULT_INTEREST_TERMS);
  });
});

describe("storedInterestTerms", () => {
  it("keeps the villa's stored rate even when interest is switched off", () => {
    // The editor must show the real rate, not 0 — otherwise saving would erase it.
    const result = storedInterestTerms(
      settings,
      villa({ chargeLatePaymentInterest: false, interestTerms: { monthlyRate: 0.05 } }),
    );
    expect(result.monthlyRate).toBe(0.05);
  });

  it("differs from the effective terms only by the switched-off rule", () => {
    const target = villa({ chargeLatePaymentInterest: false });
    expect(storedInterestTerms(settings, target).monthlyRate).toBe(DEFAULT_INTEREST_TERMS.monthlyRate);
    expect(resolveInterestTerms(settings, target).monthlyRate).toBe(0);
  });
});
