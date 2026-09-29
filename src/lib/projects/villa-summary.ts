import { compareVillaNumbers } from "@/lib/domain/villa-label";
import type { Customer, MockDatabase, Villa, VillaFinancials } from "@/lib/domain/types";
import { calculateVillaFinancials, roundMoney } from "@/lib/finance/calculations";

export type VillaSummary = {
  villa: Villa;
  customer: Customer | null;
  financials: VillaFinancials;
};

/**
 * Omit `projectId` for a cross-project summary (the global Villas list, C6).
 *
 * Ordered by villa number, not by creation time: a villa list is read as a sequence of
 * slots (01, 02, 03 …), so insertion order is noise — a villa added late still belongs in
 * its numbered position. Sorting here rather than in each page keeps the project list and
 * the global list agreeing with each other.
 */
export function deriveVillaSummaries(database: MockDatabase, projectId?: string): VillaSummary[] {
  return database.villas.filter((villa) => !projectId || villa.projectId === projectId).map((villa) => {
    const storedTerms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
    const terms = villa.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
    const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
    const calculatedFinancials = calculateVillaFinancials(schedules, terms, database.today);
    const unallocatedBalance = Math.max(0, villa.value - calculatedFinancials.totalValue);
    return {
      villa,
      customer: villa.customerId ? database.customers.find((customer) => customer.id === villa.customerId) ?? null : null,
      financials: { ...calculatedFinancials, totalValue: villa.value, outstandingPrincipal: roundMoney(calculatedFinancials.outstandingPrincipal + unallocatedBalance) },
    };
  }).sort((left, right) => compareVillaNumbers(left.villa.number, right.villa.number));
}
