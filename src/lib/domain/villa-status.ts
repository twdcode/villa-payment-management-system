import type { Villa } from "@/lib/domain/types";

/**
 * Whether a villa still counts — for money, dashboards, reminders and collections.
 *
 * A cancelled villa keeps its history but drops out of every total. Nothing is deleted;
 * it simply stops counting.
 *
 * Phase 5 splits the single `operationalStatus` into a sale status plus a programme
 * status. When that lands, this becomes `villa.programmeStatus === "active"` and the
 * eight call sites need no edit.
 */
export function isVillaActive(villa: Pick<Villa, "operationalStatus">): boolean {
  return villa.operationalStatus !== "cancelled";
}

/** The active villas belonging to one customer. */
export function villasForCustomer<T extends Pick<Villa, "operationalStatus" | "customerId">>(
  villas: readonly T[],
  customerId: string,
): T[] {
  return villas.filter((villa) => villa.customerId === customerId && isVillaActive(villa));
}
