import { describe, expect, it } from "vitest";

import type { Villa } from "@/lib/domain/types";
import { isVillaActive, villasForCustomer } from "@/lib/domain/villa-status";

const villa = (overrides: Partial<Villa>) => overrides as Villa;

describe("isVillaActive", () => {
  it("excludes cancelled villas", () => {
    expect(isVillaActive(villa({ operationalStatus: "cancelled" }))).toBe(false);
  });

  it.each(["available", "reserved", "scheduled", "sold"] as const)("includes %s villas", (status) => {
    expect(isVillaActive(villa({ operationalStatus: status }))).toBe(true);
  });
});

describe("villasForCustomer", () => {
  const villas = [
    villa({ id: "a", customerId: "c1", operationalStatus: "sold" }),
    villa({ id: "b", customerId: "c1", operationalStatus: "cancelled" }),
    villa({ id: "c", customerId: "c2", operationalStatus: "sold" }),
  ];

  it("returns only that customer's villas", () => {
    expect(villasForCustomer(villas, "c2").map((item) => item.id)).toEqual(["c"]);
  });

  it("drops cancelled villas so they cannot inflate a customer's totals", () => {
    expect(villasForCustomer(villas, "c1").map((item) => item.id)).toEqual(["a"]);
  });

  it("returns an empty list for a customer with no villas", () => {
    expect(villasForCustomer(villas, "unknown")).toEqual([]);
  });
});
