import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { advanceCreditStatus, collectionStatus, paymentMethod } from "./enums";
import { actor, createdAt, money, updatedAt } from "./columns";
import { customers, projects, villas } from "./core";
import { users } from "./access";

/**
 * Per-project default stages, used to prefill the villa setup wizard.
 *
 * A template only. Villas copy these values and own them afterwards — editing a template
 * never rewrites an existing villa's schedule.
 */
export const projectScheduleTemplates = pgTable(
  "project_schedule_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    stageNo: integer("stage_no").notNull(),
    stageName: text("stage_name").notNull(),
    deliverables: text("deliverables"),
    gracePeriodDays: integer("grace_period_days").notNull().default(0),
    createdBy: actor("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("project_templates_stage_no").on(table.projectId, table.stageNo),
    check("project_templates_grace_not_negative", sql`${table.gracePeriodDays} >= 0`),
  ],
);

/**
 * The instalments a villa is sold on. One row per stage.
 *
 * `dueDate` is a `date`, not a timestamp: "due on 10 July" is a calendar day, and storing
 * it as an instant would make it shift by timezone and silently change what interest is owed.
 *
 * NOTE: `principalPaid` / `interestPaid` are DERIVED — they are maintained inside the
 * recording transaction from the allocation rows, never written independently.
 * `v_ledger_reconciliation` re-derives them from allocations and reports any drift.
 */
export const paymentStages = pgTable(
  "payment_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    stageNo: integer("stage_no").notNull(),
    stageName: text("stage_name").notNull(),
    deliverables: text("deliverables"),
    dueDate: date("due_date"),
    principalAmount: money("principal_amount").notNull().default("0"),
    gracePeriodDays: integer("grace_period_days").notNull().default(0),
    principalPaid: money("principal_paid").notNull().default("0"),
    interestPaid: money("interest_paid").notNull().default("0"),
    interestCharged: money("interest_charged").notNull().default("0"),
    createdBy: actor("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("payment_stages_stage_no").on(table.villaId, table.stageNo),
    index("payment_stages_due_idx").on(table.villaId, table.dueDate),
    check("payment_stages_principal_not_negative", sql`${table.principalAmount} >= 0`),
    check("payment_stages_grace_not_negative", sql`${table.gracePeriodDays} >= 0`),
    check("payment_stages_paid_not_negative", sql`${table.principalPaid} >= 0 AND ${table.interestPaid} >= 0`),
    // Cannot pay more principal than the stage is worth.
    check("payment_stages_no_overpay", sql`${table.principalPaid} <= ${table.principalAmount}`),
  ],
);

/**
 * A payment received. APPEND ONLY — never updated in place, never deleted.
 *
 * A correction writes a NEW row and marks the old one superseded, keeping the SAME
 * receipt number. Only `superseded_at IS NULL` is live; every total filters on it, and
 * that filter belongs in the views so no individual query can forget it.
 */
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    // Snapshot of who held the villa when it was paid, so a later reassignment does not
    // rewrite history on an issued receipt.
    customerId: uuid("customer_id").notNull().references(() => customers.id),

    paymentDate: date("payment_date").notNull(),
    amount: money("amount").notNull(),

    method: paymentMethod("method").notNull(),
    referenceNo: text("reference_no"),
    receiptNo: text("receipt_no").notNull(),
    // Set by the client when the form opens. The UNIQUE constraint is what actually stops
    // a double submit — a disabled button is not a guarantee.
    idempotencyKey: text("idempotency_key").unique().notNull(),
    receiptDocumentUrl: text("receipt_document_url"),
    notes: text("notes"),

    status: collectionStatus("status").notNull().default("confirmed"),

    supersedesId: uuid("supersedes_id"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededBy: actor("superseded_by").references(() => users.id),
    editReason: text("edit_reason"),

    recordedBy: uuid("recorded_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("collections_villa_idx").on(table.villaId),
    index("collections_customer_idx").on(table.customerId),
    index("collections_payment_date_idx").on(table.paymentDate),
    index("collections_superseded_idx").on(table.supersededAt),
    // Receipt numbers are NOT globally unique: an edit reuses the original number, so the
    // old and new rows share it. Unique among LIVE rows only, or every edit would fail.
    uniqueIndex("collections_live_receipt_no")
      .on(table.receiptNo)
      .where(sql`superseded_at IS NULL`),
    check("collections_amount_positive", sql`${table.amount} > 0`),
    // A superseded row must say when and why; a live row must not claim it was superseded.
    check(
      "collections_supersede_consistent",
      sql`(${table.status} = 'superseded') = (${table.supersededAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * How one payment was split across stages.
 *
 * INVARIANT, asserted inside the recording transaction:
 *   collection.amount = SUM(principal + interest) + SUM(advance credit)
 * Exactly. If it does not balance the transaction rolls back and no receipt is issued.
 *
 * `interestAmount` is the CHARGED figure. It is stored, never recomputed — it is what the
 * customer's receipt says, and history must not move when a rate is edited later.
 */
export const collectionAllocations = pgTable(
  "collection_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id").notNull().references(() => collections.id),
    paymentStageId: uuid("payment_stage_id").notNull().references(() => paymentStages.id),
    principalAmount: money("principal_amount").notNull().default("0"),
    interestAmount: money("interest_amount").notNull().default("0"),
    isManualOverride: boolean("is_manual_override").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("allocations_collection_idx").on(table.collectionId),
    index("allocations_stage_idx").on(table.paymentStageId),
    check(
      "allocations_not_negative",
      sql`${table.principalAmount} >= 0 AND ${table.interestAmount} >= 0`,
    ),
    // An allocation that moves no money is noise in the ledger.
    check("allocations_move_money", sql`${table.principalAmount} + ${table.interestAmount} > 0`),
  ],
);

/** Money received with no unpaid stage left to absorb it. */
export const advanceCredits = pgTable(
  "advance_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    collectionId: uuid("collection_id").notNull().references(() => collections.id),
    amount: money("amount").notNull(),
    status: advanceCreditStatus("status").notNull().default("available"),
    createdAt: createdAt(),
  },
  (table) => [
    index("advance_credits_villa_idx").on(table.villaId),
    index("advance_credits_collection_idx").on(table.collectionId),
    check("advance_credits_amount_positive", sql`${table.amount} > 0`),
  ],
);

/** Drawing an advance credit down against a stage as it falls due. */
export const advanceCreditApplications = pgTable(
  "advance_credit_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advanceCreditId: uuid("advance_credit_id").notNull().references(() => advanceCredits.id),
    paymentStageId: uuid("payment_stage_id").notNull().references(() => paymentStages.id),
    amount: money("amount").notNull(),
    appliedBy: actor("applied_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("credit_applications_credit_idx").on(table.advanceCreditId),
    check("credit_applications_amount_positive", sql`${table.amount} > 0`),
  ],
);
