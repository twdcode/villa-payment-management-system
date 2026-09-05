import { describe, expect, it } from "vitest";

import { matchesVillaSearch } from "@/lib/domain/villa-search";

describe("matchesVillaSearch", () => {
  it("matches the label the user actually sees, not just the stored number", () => {
    // The reported bug: villa_number is "01", the screen reads "Villa 01", and typing "v"
    // returned "No matching villas".
    expect(matchesVillaSearch("v", "01")).toBe(true);
    expect(matchesVillaSearch("villa", "01")).toBe(true);
    expect(matchesVillaSearch("villa 01", "01")).toBe(true);
  });

  it("still matches the bare number and a prefixed number", () => {
    expect(matchesVillaSearch("01", "01")).toBe(true);
    expect(matchesVillaSearch("12", "JV-12")).toBe(true);
    expect(matchesVillaSearch("jv", "JV-12")).toBe(true);
  });

  it("matches the assigned customer name", () => {
    expect(matchesVillaSearch("nimal", "01", "Nimal Perera")).toBe(true);
    expect(matchesVillaSearch("perera", "01", "Nimal Perera")).toBe(true);
  });

  it("ignores term order and extra whitespace", () => {
    expect(matchesVillaSearch("01 villa", "01")).toBe(true);
    expect(matchesVillaSearch("  villa   01  ", "01")).toBe(true);
    expect(matchesVillaSearch("perera 01", "01", "Nimal Perera")).toBe(true);
  });

  it("returns every villa for an empty query", () => {
    expect(matchesVillaSearch("", "01")).toBe(true);
    expect(matchesVillaSearch("   ", "01")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesVillaSearch("02", "01")).toBe(false);
    expect(matchesVillaSearch("silva", "01", "Nimal Perera")).toBe(false);
    // Every term must hit: the villa matches "villa" but not "99".
    expect(matchesVillaSearch("villa 99", "01")).toBe(false);
  });

  it("handles a villa with no assigned customer", () => {
    expect(matchesVillaSearch("villa 01", "01", null)).toBe(true);
    expect(matchesVillaSearch("nimal", "01", null)).toBe(false);
  });
});
