import type { InterestTerms, Villa, WorkspaceSettings } from "@/lib/domain/types";

type VillaTerms = Pick<Villa, "chargeLatePaymentInterest" | "interestTerms">;
type Settings = Pick<WorkspaceSettings, "defaultInterestTerms">;

/**
 * The terms held against a villa: workspace defaults with the villa's overrides applied.
 *
 * This is what the interest editor shows, because it edits the stored rate. It ignores
 * whether interest is currently switched on — switching it off must not erase the rate
 * the villa would go back to when switched on again.
 *
 * For anything that calculates money, use `resolveInterestTerms` instead.
 */
export function storedInterestTerms(settings: Settings, villa: VillaTerms | undefined): InterestTerms {
  return { ...settings.defaultInterestTerms, ...villa?.interestTerms };
}

/**
 * The terms that actually apply when charging interest.
 *
 * The stored terms, plus the rule that a villa with interest switched off is charged
 * nothing — whatever the stored rate says.
 *
 * That last rule lived in six components and one copy omitted it, charging interest on
 * villas where it was disabled. This is the only place it exists now. Every calculation
 * goes through here.
 */
export function resolveInterestTerms(settings: Settings, villa: VillaTerms | undefined): InterestTerms {
  const terms = storedInterestTerms(settings, villa);
  return villa?.chargeLatePaymentInterest === false ? { ...terms, monthlyRate: 0 } : terms;
}
