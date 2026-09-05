import { describe, expect, it } from "vitest";

import { formatLkr, formatLkrCompact, numberToWordsLkr } from "@/lib/formatters";

/** `Intl`'s currency formatter uses U+00A0 (NBSP) between the symbol and the digits. */
const NBSP = " ";
function oldCompact(value: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", notation: "compact", maximumFractionDigits: 1 }).format(value);
}
function normalizeSpaces(value: string) {
  return value.replaceAll(NBSP, " ");
}

describe("formatLkr", () => {
  it("formats whole LKR amounts with no decimals", () => {
    expect(normalizeSpaces(formatLkr(25000000))).toBe("LKR 25,000,000");
  });
});

describe("formatLkrCompact", () => {
  it("matches Intl's own compact currency output for realistic villa/project values", () => {
    // The bug this guards: Node's and Chrome's ICU disagree on whether to print a
    // trailing ".0" for a whole compact value (e.g. 5000000), which broke hydration.
    // formatLkrCompact must reproduce Intl's *chosen digits* deterministically instead
    // of delegating that choice to Intl at render time.
    const values = [1000, 5000000, 25000000, 63750, 100000, 999999, 1234567890, 1500000000];
    for (const value of values) {
      expect(normalizeSpaces(formatLkrCompact(value))).toBe(normalizeSpaces(oldCompact(value)));
    }
  });

  it("rounds up into the next unit at the 999,950 boundary, same as Intl", () => {
    expect(normalizeSpaces(formatLkrCompact(999950))).toBe(normalizeSpaces(oldCompact(999950)));
    expect(normalizeSpaces(formatLkrCompact(999949))).toBe(normalizeSpaces(oldCompact(999949)));
  });

  it("handles negative and zero values", () => {
    expect(formatLkrCompact(0)).toBe("LKR 0");
    expect(formatLkrCompact(-1500000)).toBe("-LKR 1.5M");
  });

  it("is deterministic — same input always produces the same string", () => {
    for (const value of [5000000, 63750, 999950, 1234567890]) {
      expect(formatLkrCompact(value)).toBe(formatLkrCompact(value));
    }
  });
});

describe("numberToWordsLkr", () => {
  it("spells out amounts the motivating case cares about: telling zero counts apart", () => {
    expect(numberToWordsLkr(2000000)).toBe("two million rupees");
    expect(numberToWordsLkr(2002000)).toBe("two million two thousand rupees");
    expect(numberToWordsLkr(200000)).toBe("two hundred thousand rupees");
  });

  it("handles hundreds within a group with 'and'", () => {
    expect(numberToWordsLkr(5440000)).toBe("five million four hundred and forty thousand rupees");
    expect(numberToWordsLkr(123)).toBe("one hundred and twenty-three rupees");
  });

  it("handles singular, zero, and negative values", () => {
    expect(numberToWordsLkr(1)).toBe("one rupee");
    expect(numberToWordsLkr(0)).toBe("zero rupees");
    expect(numberToWordsLkr(-1500000)).toBe("minus one million five hundred thousand rupees");
  });

  it("rounds fractional input to the nearest whole rupee", () => {
    expect(numberToWordsLkr(999.6)).toBe("one thousand rupees");
  });
});
