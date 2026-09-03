import { DEMO_TODAY } from "@/lib/config/demo";
import { calculateVillaFinancials, roundMoney } from "@/lib/finance/calculations";
import type { MockDatabase, Project, Villa } from "@/lib/domain/types";

export type ProjectSummary = {
  project: Project;
  villas: Villa[];
  villaCount: number;
  totalValue: number;
  principalCollected: number;
  outstandingPrincipal: number;
  availableVillaCount: number;
  allocationProgress: number;
};

export function deriveProjectSummaries(database: MockDatabase): ProjectSummary[] {
  return database.projects.map((project) => {
    const villas = database.villas.filter((villa) => villa.projectId === project.id);
    const financials = villas.reduce(
      (totals, villa) => {
        const storedTerms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
        const terms = villa.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
        const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
        const calculatedFinancials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
        const villaFinancials = { ...calculatedFinancials, outstandingPrincipal: roundMoney(calculatedFinancials.outstandingPrincipal + Math.max(0, villa.value - calculatedFinancials.totalValue)) };
        return {
          principalCollected: roundMoney(totals.principalCollected + villaFinancials.principalCollected),
          outstandingPrincipal: roundMoney(totals.outstandingPrincipal + villaFinancials.outstandingPrincipal),
        };
      },
      { principalCollected: 0, outstandingPrincipal: 0 },
    );
    const totalValue = villas.reduce((total, villa) => roundMoney(total + villa.value), 0);

    return {
      project,
      villas,
      villaCount: Math.max(villas.length, project.plannedVillaCount ?? 0),
      totalValue,
      principalCollected: financials.principalCollected,
      outstandingPrincipal: financials.outstandingPrincipal,
      availableVillaCount: villas.filter((villa) => villa.operationalStatus === "available").length,
      allocationProgress: totalValue === 0 ? 0 : Math.round((financials.principalCollected / totalValue) * 100),
    };
  });
}
