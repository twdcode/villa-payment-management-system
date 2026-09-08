import { describe, expect, it } from "vitest";

import { villaLabel, villaLabelWithProject } from "@/lib/domain/villa-label";

describe("villaLabel", () => {
  it("prefixes a bare number so it reads as a villa", () => {
    expect(villaLabel("12")).toBe("Villa 12");
    expect(villaLabel("01")).toBe("Villa 01");
  });

  it("keeps a prefixed number intact", () => {
    // The regression this replaced: `MB-01` and `HC-01` both rendered as "Villa 01",
    // which is two different villas under one label.
    expect(villaLabel("MB-01")).toBe("MB-01");
    expect(villaLabel("HC-01")).toBe("HC-01");
    expect(villaLabel("MB-01")).not.toBe(villaLabel("HC-01"));
  });

  it("leaves a written name alone rather than saying 'Villa Sunset Villa'", () => {
    expect(villaLabel("Sunset Villa")).toBe("Sunset Villa");
    expect(villaLabel("The Banyan")).toBe("The Banyan");
  });

  it("trims and survives an empty value", () => {
    expect(villaLabel("  7  ")).toBe("Villa 7");
    expect(villaLabel("")).toBe("Villa");
  });
});

describe("villaLabelWithProject", () => {
  it("disambiguates numbers that repeat across projects", () => {
    expect(villaLabelWithProject("01", "Marina Bay")).toBe("Villa 01 · Marina Bay");
    expect(villaLabelWithProject("01", "Hillcrest")).toBe("Villa 01 · Hillcrest");
  });

  it("falls back to the label alone when no project is known", () => {
    expect(villaLabelWithProject("MB-04", null)).toBe("MB-04");
  });
});
