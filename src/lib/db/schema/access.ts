import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { accessScope, allocationOrder, interestStartRule, scopeType, templateType, userRole, userStatus } from "./enums";
import { actor, createdAt, rate, updatedAt } from "./columns";

/**
 * App users, mirrored from Supabase `auth.users`.
 *
 * The role is ALSO written to the auth user's `app_metadata` so it reaches the JWT.
 * Never `user_metadata` — users can write that themselves, which would make becoming a
 * super admin a one-line request.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").unique().notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  role: userRole("role").notNull().default("view_only"),
  scope: accessScope("scope").notNull().default("global"),
  status: userStatus("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Per-project / per-villa grants. Created EMPTY and stays empty while every user is
 * `global` — it exists so adding scoped roles later is a data change, not a migration
 * plus a rewrite of every policy. See SCOPED-ROLES.md.
 */
export const userAssignments = pgTable(
  "user_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    scopeType: scopeType("scope_type").notNull(),
    scopeId: uuid("scope_id").notNull(),
    createdBy: actor("created_by"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("user_assignments_unique").on(table.userId, table.scopeType, table.scopeId),
    index("user_assignments_user_idx").on(table.userId),
  ],
);

/** Workspace-wide settings. One row, enforced by the id CHECK. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: smallint("id").primaryKey().default(1),
    companyName: text("company_name").notNull(),
    // LKR only for now. Kept as a column so the multi-currency path stays open without a
    // migration; `DATABASE.md` describes what else would have to change.
    currency: text("currency").notNull().default("LKR"),
    timezone: text("timezone").notNull().default("Asia/Colombo"),
    dateFormat: text("date_format").notNull().default("dd/MM/yyyy"),
    receiptPrefix: text("receipt_prefix").notNull().default("JVM-RCP"),
    updatedBy: actor("updated_by"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("app_settings_singleton", sql`${table.id} = 1`),
    check("app_settings_currency_is_lkr", sql`${table.currency} = 'LKR'`),
  ],
);

/**
 * Default interest terms, copied into each villa agreement at setup.
 *
 * Changing these NEVER changes an existing agreement — a signed contract must not move
 * because someone edited a default.
 */
export const interestDefaults = pgTable(
  "interest_defaults",
  {
    id: smallint("id").primaryKey().default(1),
    chargeInterest: boolean("charge_interest").notNull().default(true),
    monthlyRate: rate("monthly_rate").notNull(),
    graceDays: integer("grace_days").notNull(),
    prorataDivisor: integer("prorata_divisor").notNull().default(30),
    interestStart: interestStartRule("interest_start").notNull().default("after_grace"),
    firstReminderDay: integer("first_reminder_day").notNull(),
    secondReminderDay: integer("second_reminder_day").notNull(),
    finalNoticeDay: integer("final_notice_day").notNull(),
    allocationOrder: allocationOrder("allocation_order").notNull().default("interest_first"),
    updatedBy: actor("updated_by"),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("interest_defaults_singleton", sql`${table.id} = 1`),
    // A fraction, never a percent. `1.5` here would mean 150% a month.
    check("interest_defaults_rate_is_fraction", sql`${table.monthlyRate} >= 0 AND ${table.monthlyRate} < 1`),
    check("interest_defaults_divisor_positive", sql`${table.prorataDivisor} > 0`),
    check("interest_defaults_grace_not_negative", sql`${table.graceDays} >= 0`),
  ],
);

/** Named grace periods offered in the settings UI. */
export const gracePeriods = pgTable(
  "grace_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    days: integer("days").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: actor("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [check("grace_periods_days_not_negative", sql`${table.days} >= 0`)],
);

/** Email templates for reminders. */
export const reminderTemplates = pgTable("reminder_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: templateType("type").notNull().default("custom"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: actor("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
