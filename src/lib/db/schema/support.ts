import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { activityEventType, deliveryStatus, noteScope, reminderOrigin, reminderStatus, reminderTrigger } from "./enums";
import { actor, createdAt, updatedAt } from "./columns";
import { customers, villas } from "./core";
import { paymentStages } from "./money";
import { reminderTemplates, users } from "./access";

/**
 * The reminder outbox. A reminder is a ROW, not a calculation.
 *
 * Storing the message means "did we contact this customer?" is answerable from the
 * database, the send is retryable, and a cron re-run cannot email someone twice.
 */
export const reminderRequests = pgTable(
  "reminder_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    paymentStageId: uuid("payment_stage_id").references(() => paymentStages.id),
    templateId: uuid("template_id").references(() => reminderTemplates.id),

    origin: reminderOrigin("origin").notNull().default("system"),
    /** Which schedule event queued this row. NULL for user-initiated requests. */
    trigger: reminderTrigger("trigger"),
    status: reminderStatus("status").notNull().default("awaiting_approval"),

    sendDate: date("send_date").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    attachmentName: text("attachment_name"),
    attachmentUrl: text("attachment_url"),

    requestedBy: actor("requested_by").references(() => users.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: actor("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    deliveryStatus: deliveryStatus("delivery_status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
    /** Why a reviewer cancelled this rather than sending it — a decision, not a provider failure. */
    rejectionReason: text("rejection_reason"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("reminders_villa_idx").on(table.villaId),
    index("reminders_customer_idx").on(table.customerId),
    index("reminders_status_idx").on(table.status),
    index("reminders_send_date_idx").on(table.sendDate),
    // Nothing counts as sent without a timestamp — otherwise "have we contacted them?"
    // has no reliable answer.
    check("reminders_sent_has_timestamp", sql`${table.status} <> 'sent' OR ${table.sentAt} IS NOT NULL`),
    // One system request per stage per trigger, INCLUDING after it is sent. A trigger is a
    // moment crossed once ("14 days past grace"), not a recurring state, so crossing it
    // should produce exactly one reminder ever — escalation is what the later triggers are
    // for. Covering only live rows meant a sent reminder re-queued on the next queue run,
    // which became every Collections page load once queuing moved off the nightly cron.
    // Scoped to origin = 'system' so a user manually preparing a reminder is never blocked
    // by an unrelated schedule trigger.
    uniqueIndex("reminder_requests_one_per_stage_trigger")
      .on(table.paymentStageId, table.trigger)
      .where(sql`status IN ('awaiting_approval', 'ready_to_send', 'sent') AND origin = 'system' AND payment_stage_id IS NOT NULL AND trigger IS NOT NULL`),
  ],
);

/** Free-text notes against a villa or a customer. */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: noteScope("scope").notNull(),
    villaId: uuid("villa_id").references(() => villas.id),
    customerId: uuid("customer_id").references(() => customers.id),
    content: text("content").notNull(),
    authorId: actor("author_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("notes_villa_idx").on(table.villaId),
    index("notes_customer_idx").on(table.customerId),
    // A note must attach to exactly the thing its scope names.
    check(
      "notes_scope_matches_target",
      sql`(${table.scope} = 'villa' AND ${table.villaId} IS NOT NULL AND ${table.customerId} IS NULL)
        OR (${table.scope} = 'customer' AND ${table.customerId} IS NOT NULL AND ${table.villaId} IS NULL)`,
    ),
  ],
);

/**
 * Document links. The file itself is NEVER stored here — only a URL to it.
 *
 * Every link is opened with `rel="noopener noreferrer"`; without `noopener` the opened
 * page can reach back and navigate this one.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    name: text("name").notNull(),
    documentDate: date("document_date"),
    url: text("url").notNull(),
    addedBy: actor("added_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_villa_idx").on(table.villaId),
    // Reject anything that is not an http(s) URL — `javascript:` in an href is XSS.
    check("documents_url_is_http", sql`${table.url} ~* '^https?://'`),
  ],
);


/**
 * Stored notification EVENTS — facts that happened, like "payment recorded".
 *
 * Alerts ("payment overdue") are NOT stored: they are derived from the schedule on read,
 * so they cannot go stale. Settle the payment and the alert leaves the result set on its
 * own. See BACKEND-PLAN D1.
 *
 * `WorkspaceNotification` in the frontend is assembled by the server from these rows plus
 * the derived alerts. The UI shape does not change.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: activityEventType("type").notNull(),
    villaId: uuid("villa_id").references(() => villas.id),
    customerId: uuid("customer_id").references(() => customers.id),
    collectionId: uuid("collection_id"),
    paymentStageId: uuid("payment_stage_id").references(() => paymentStages.id),
    actorId: actor("actor_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_events_created_idx").on(table.createdAt),
    index("activity_events_villa_idx").on(table.villaId),
  ],
);

/**
 * Who has read which notification.
 *
 * `notificationKey` is a stable string identifying the alert or event — for a derived
 * alert it is composed from the stage and its state, so the same alert keeps one identity
 * across reloads without needing a stored row.
 *
 * Replaces the mock's `readBy[]` array, which could not be queried or indexed.
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    notificationKey: text("notification_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.notificationKey] }),
    index("notification_reads_user_idx").on(table.userId),
  ],
);

/**
 * Delivery history for reminders that were actually sent.
 *
 * Separate from `reminder_requests`: a request is an intention that may be edited or
 * cancelled, a log row is a permanent record that an email left the system. Append only.
 */
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderRequestId: uuid("reminder_request_id").references(() => reminderRequests.id),
    templateId: uuid("template_id").references(() => reminderTemplates.id),
    paymentStageId: uuid("payment_stage_id").references(() => paymentStages.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    sentBy: actor("sent_by").references(() => users.id),
    deliveryStatus: deliveryStatus("delivery_status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    deliveryError: text("delivery_error"),
  },
  (table) => [
    index("reminder_logs_customer_idx").on(table.customerId),
    index("reminder_logs_sent_idx").on(table.sentAt),
  ],
);

/**
 * Append-only audit trail. Every mutation writes one row.
 *
 * `before` / `after` are JSONB snapshots, so "what did this look like before the edit?"
 * is answerable without replaying anything.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    actorId: actor("actor_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_record_idx").on(table.tableName, table.recordId),
    index("audit_actor_idx").on(table.actorId),
    index("audit_created_idx").on(table.createdAt),
  ],
);
