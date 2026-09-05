import type {
  InterestTerms,
  ProjectPaymentScheduleDefault,
  WorkspaceSettings,
} from "@/lib/domain/types";

export const DEMO_TODAY = "2026-08-28";

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

function projectSchedule(projectId: string): ProjectPaymentScheduleDefault {
  return {
    projectId,
    stages: DEFAULT_PAYMENT_SCHEDULE_STAGES.map((stage, index) => ({
      id: `${projectId}-default-stage-${index + 1}`,
      stage,
      gracePeriodDays: DEFAULT_INTEREST_TERMS.gracePeriodDays,
    })),
  };
}

export const DEFAULT_PROJECT_PAYMENT_SCHEDULES = [
  projectSchedule("project-ocean"),
  projectSchedule("project-palm"),
  projectSchedule("project-serenity"),
];

export const DEMO_SETTINGS: WorkspaceSettings = {
  companyName: "Juniper Villa Management",
  currency: "LKR",
  timezone: "Asia/Colombo",
  dateFormat: "dd MMM yyyy",
  receiptPrefix: "JVM-RCP",
  defaultChargeLatePaymentInterest: true,
  defaultInterestTerms: DEFAULT_INTEREST_TERMS,
  gracePeriods: [
    {
      id: "grace-standard",
      name: "Standard grace period",
      days: DEFAULT_INTEREST_TERMS.gracePeriodDays,
      description:
        "Standard payment extension applied to future villa payment agreements.",
      isDefault: true,
      isActive: true,
    },
  ],
  projectPaymentScheduleDefaults: DEFAULT_PROJECT_PAYMENT_SCHEDULES,
};
