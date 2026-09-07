import type { CollectionRowStatus } from "@/lib/domain/collection-rows";
import type { CollectionStatus, PaymentStatus, ProjectStatus, ReminderTemplate, VillaOperationalStatus } from "@/lib/domain/types";

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

/**
 * Labels for the merged Collections table, which lists unpaid installments beside the
 * payments recorded against them. `due_soon` is a display-only split of `not_due` — the
 * finance layer has no 60-day concept, so it is not a `PaymentStatus`.
 */
export const collectionRowStatusLabels: Record<CollectionRowStatus, string> = {
  not_due: "Scheduled",
  due_soon: "Next 60 days",
  due: "Due now",
  overdue: "Overdue",
  partially_paid: "Partially paid",
  paid: "Paid",
  confirmed: "Confirmed",
  superseded: "Superseded",
};
export const reminderTemplateTypeLabels: Record<ReminderTemplate["type"], string> = {
  upcoming: "Upcoming payment",
  overdue: "Payment overdue",
  payment_received: "Payment received",
  final_notice: "Final notice",
  custom: "Custom",
};
