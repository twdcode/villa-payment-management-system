import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Every enum is defined once here and reused, so a value can never drift between
 * two tables. These mirror `src/lib/domain/types.ts` exactly — if you change one,
 * change both, or the repository layer will fail to map a row.
 */

export const userRole = pgEnum("user_role", ["super_admin", "editor", "staff", "view_only"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);

/** `global` sees everything. `scoped` sees only assigned rows. Everyone is global today. */
export const accessScope = pgEnum("access_scope", ["global", "scoped"]);
export const scopeType = pgEnum("scope_type", ["project", "villa"]);

export const projectStatus = pgEnum("project_status", ["active", "completed"]);

/** Where a villa sits in the sales pipeline. Independent of whether it is cancelled. */
export const villaSaleStatus = pgEnum("villa_sale_status", ["available", "reserved", "scheduled", "sold"]);
/** Whether the villa is still running. Cancelled villas keep their history but stop counting. */
export const villaProgrammeStatus = pgEnum("villa_programme_status", ["active", "cancelled"]);

export const interestStartRule = pgEnum("interest_start_rule", ["after_grace", "from_due_date"]);
export const allocationOrder = pgEnum("allocation_order", ["interest_first", "principal_first"]);

/** Cheque and card are method labels only — there is no clearing workflow. */
export const paymentMethod = pgEnum("payment_method", ["bank_transfer", "cash", "cheque", "card"]);

/** There is no reversal. A mistake is corrected by an edit, which supersedes the old row. */
export const collectionStatus = pgEnum("collection_status", ["confirmed", "superseded"]);

export const reminderStatus = pgEnum("reminder_status", ["awaiting_approval", "ready_to_send", "sent", "cancelled"]);
export const reminderOrigin = pgEnum("reminder_origin", ["system", "user"]);
/**
 * Which schedule event queued a reminder — independent of which template's wording was
 * used. A workspace has one 'overdue' template but two separate overdue reminders
 * (first_reminder_day, second_reminder_day); the trigger is what tells them apart so the
 * double-send guard does not collapse them into one.
 */
export const reminderTrigger = pgEnum("reminder_trigger", ["upcoming", "overdue_first", "overdue_second", "final_notice"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "delivered", "bounced", "failed"]);
/** Mirrors `ReminderTemplate["type"]` in domain/types.ts — the names must match exactly. */
export const templateType = pgEnum("template_type", [
  "upcoming",
  "overdue",
  "payment_received",
  "final_notice",
  "custom",
]);

/** What a stored activity event records. Alerts are derived, not stored (BACKEND-PLAN D1). */
export const activityEventType = pgEnum("activity_event_type", ["payment_recorded"]);

export const noteScope = pgEnum("note_scope", ["villa", "customer"]);
export const advanceCreditStatus = pgEnum("advance_credit_status", ["available", "partially_applied", "applied"]);
