import type { InterestTerms } from "@/lib/domain/types";

/**
 * Workspace defaults, from the Figma designs and the PRD (C9).
 *
 * `monthlyRate` is a FRACTION, not a percent: 0.015 = 1.5%. The UI multiplies by 100 for
 * display. Getting this backwards makes every interest figure 100x wrong.
 *
 * The worked examples in docs/INTEREST-EXAMPLES.md are derived from exactly these values —
 * E1 gives LKR 34,000 on 2,000,000 over 34 chargeable days. Change one and the test suite
 * no longer reproduces.
 */
export const DEFAULT_INTEREST_TERMS: InterestTerms = {
  monthlyRate: 0.015,
  gracePeriodDays: 15,
  proRataDivisor: 30,
  interestStart: "after_grace",
  allocationOrder: "interest_first",
  reminderDaysAfterDue: 14,
  secondReminderDaysAfterDue: 21,
  finalNoticeDaysAfterDue: 28,
};

/** The 8 stage names offered when setting up a villa's payment schedule. */
export const DEFAULT_PAYMENT_SCHEDULE_STAGES = [
  "Land Reservation",
  "Land Allocation & Foundation",
  "Concrete, Brickwork & Roof",
  "Plumbing, Electrical & Plastering",
  "Tiling, Doors & Painting",
  "Window & Door Frames",
  "Certificate of Completion",
  "Landscaping, Title & Handover",
] as const;
