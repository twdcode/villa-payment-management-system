import { DEMO_TODAY } from "@/lib/config/demo";
import type { Customer, MockDatabase, Villa, VillaFinancials } from "@/lib/domain/types";
import { calculateVillaFinancials, roundMoney } from "@/lib/finance/calculations";

export type VillaSummary = {
  villa: Villa;
  customer: Customer | null;
  financials: VillaFinancials;
};

export function deriveVillaSummaries(database: MockDatabase, projectId: string): VillaSummary[] {
  return database.villas.filter((villa) => villa.projectId === projectId).map((villa) => {
    const storedTerms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
    const terms = villa.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
    const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
    const calculatedFinancials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
    const unallocatedBalance = Math.max(0, villa.value - calculatedFinancials.totalValue);
    return {
      villa,
      customer: villa.customerId ? database.customers.find((customer) => customer.id === villa.customerId) ?? null : null,
      financials: { ...calculatedFinancials, totalValue: villa.value, outstandingPrincipal: roundMoney(calculatedFinancials.outstandingPrincipal + unallocatedBalance) },
    };
  });
}
