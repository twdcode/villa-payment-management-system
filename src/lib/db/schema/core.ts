import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { allocationOrder, interestStartRule, projectStatus, villaProgrammeStatus, villaSaleStatus } from "./enums";
import { actor, createdAt, money, rate, updatedAt } from "./columns";
import { users } from "./access";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    location: text("location"),
    status: projectStatus("status").notNull().default("active"),
    plannedVillaCount: integer("planned_villa_count"),
    createdBy: actor("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("projects_status_idx").on(table.status)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    nicPassport: text("nic_passport"),
    address: text("address"),
    createdBy: actor("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("customers_name_idx").on(table.fullName)],
);

/**
 * Two independent statuses, deliberately not one column (C4):
 *   `saleStatus`      where it sits in the pipeline
 *   `programmeStatus` whether it is still running
 *
 * Collapsing them loses information — a cancelled villa was still *sold* to someone, and
 * that matters for history and reporting.
 */
export const villas = pgTable(
  "villas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    villaNumber: text("villa_number").notNull(),
    villaType: text("villa_type"),
    villaValue: money("villa_value").notNull().default("0"),

    saleStatus: villaSaleStatus("sale_status").notNull().default("available"),
    programmeStatus: villaProgrammeStatus("programme_status").notNull().default("active"),

    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: actor("cancelled_by").references(() => users.id),

    createdBy: actor("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("villas_number_per_project").on(table.projectId, table.villaNumber),
    index("villas_project_idx").on(table.projectId),
    index("villas_sale_status_idx").on(table.saleStatus),
    index("villas_programme_status_idx").on(table.programmeStatus),
    check("villas_value_not_negative", sql`${table.villaValue} >= 0`),
    // Cancelling requires a reason — enforced here, not only in the form.
    check(
      "villas_cancellation_has_reason",
      sql`${table.programmeStatus} <> 'cancelled' OR ${table.cancellationReason} IS NOT NULL`,
    ),
  ],
);

/**
 * Which customer holds which villa, as history.
 *
 * One ACTIVE customer per villa (no joint buyers). Reassigning closes the old row and
 * opens a new one, so past receipts still resolve to the right person.
 */
export const villaCustomers = pgTable(
  "villa_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id").notNull().references(() => villas.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: actor("assigned_by").references(() => users.id),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    unassignedBy: actor("unassigned_by").references(() => users.id),
  },
  (table) => [
    // Partial unique: only one LIVE assignment per villa. Closed rows are unconstrained,
    // so a villa can be reassigned any number of times without losing its history.
    uniqueIndex("villa_customers_one_active")
      .on(table.villaId)
      .where(sql`unassigned_at IS NULL`),
    index("villa_customers_customer_idx").on(table.customerId),
  ],
);

/**
 * Per-villa interest terms, copied from `interest_defaults` at setup.
 *
 * A separate table rather than columns on `villas` because these are the agreement's
 * terms: they are frozen at signing and must not move when workspace defaults change.
 */
export const villaInterestTerms = pgTable(
  "villa_interest_terms",
  {
    villaId: uuid("villa_id").primaryKey().references(() => villas.id),
    chargeInterest: boolean("charge_interest").notNull().default(true),
    monthlyRate: rate("monthly_rate").notNull(),
    graceDays: integer("grace_days").notNull(),
    prorataDivisor: integer("prorata_divisor").notNull().default(30),
    interestStart: interestStartRule("interest_start").notNull().default("after_grace"),
    firstReminderDay: integer("first_reminder_day").notNull(),
    secondReminderDay: integer("second_reminder_day").notNull(),
    finalNoticeDay: integer("final_notice_day").notNull(),
    allocationOrder: allocationOrder("allocation_order").notNull().default("interest_first"),
    updatedBy: actor("updated_by").references(() => users.id),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("villa_terms_rate_is_fraction", sql`${table.monthlyRate} >= 0 AND ${table.monthlyRate} < 1`),
    check("villa_terms_divisor_positive", sql`${table.prorataDivisor} > 0`),
    check("villa_terms_grace_not_negative", sql`${table.graceDays} >= 0`),
  ],
);
