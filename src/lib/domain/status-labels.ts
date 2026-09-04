import type { CollectionStatus, PaymentStatus, ProjectStatus, VillaOperationalStatus } from "@/lib/domain/types";

export const projectStatusLabels: Record<ProjectStatus, string> = { active: "Active", completed: "Completed" };
export const villaStatusLabels: Record<VillaOperationalStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  sold: "Sold",
};
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_due: "Not due",
  due: "Due",
  overdue: "Overdue",
  paid: "Paid",
  partially_paid: "Partially paid",
};
export const collectionStatusLabels: Record<CollectionStatus, string> = { confirmed: "Confirmed", superseded: "Superseded" };
