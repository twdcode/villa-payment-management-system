import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type { User } from "@/lib/domain/types";

/**
 * Seeds a real `public.users` row (plus a matching `auth.users` stub row) and returns
 * the domain `User` shape `setCurrentTestUser` needs. Every write path in
 * SupabaseRepository resolves `created_by` / `actor_id` through `getCurrentUser()`, so
 * tests need a REAL row for those foreign keys to resolve, not a mock object.
 */
export async function seedUser(role: User["role"] = "super_admin"): Promise<User> {
  const authUserId = randomUUID();
  const email = `test-${randomUUID()}@example.com`;
  await db.execute(sql`INSERT INTO auth.users (id, email) VALUES (${authUserId}, ${email})`);
  const [row] = await db.insert(schema.users).values({ authUserId, fullName: "Test User", email, role, status: "active", scope: "global" }).returning();
  return { id: row.id, name: row.fullName, email: row.email, role: row.role, isActive: row.status === "active" };
}

export async function seedProject(overrides: Partial<{ name: string; status: "active" | "completed" }> = {}) {
  const [row] = await db.insert(schema.projects).values({ name: overrides.name ?? `Project ${randomUUID().slice(0, 8)}`, location: "Test Location", status: overrides.status ?? "active" }).returning();
  return row;
}

export async function seedCustomer(overrides: Partial<{ fullName: string; email: string }> = {}) {
  const [row] = await db.insert(schema.customers).values({ fullName: overrides.fullName ?? "Test Customer", email: overrides.email ?? `customer-${randomUUID().slice(0, 8)}@example.com`, phone: "+94 77 000 0000" }).returning();
  return row;
}

/** A villa with baseline interest terms (1.5%/30/15-day grace, interest-first) and one customer assigned. */
export async function seedVilla(projectId: string, customerId: string, overrides: Partial<{ villaValue: number; villaNumber: string }> = {}) {
  const [villa] = await db.insert(schema.villas).values({
    projectId,
    villaNumber: overrides.villaNumber ?? `V-${randomUUID().slice(0, 6)}`,
    villaValue: String(overrides.villaValue ?? 10_000_000),
  }).returning();
  await db.insert(schema.villaCustomers).values({ villaId: villa.id, customerId });
  await db.insert(schema.villaInterestTerms).values({
    villaId: villa.id,
    monthlyRate: "0.015",
    graceDays: 15,
    prorataDivisor: 30,
    interestStart: "after_grace",
    firstReminderDay: 14,
    secondReminderDay: 21,
    finalNoticeDay: 28,
    allocationOrder: "interest_first",
  });
  return villa;
}

export async function seedStage(villaId: string, overrides: Partial<{ stageNo: number; stageName: string; dueDate: string; principalAmount: number; graceDays: number }> = {}) {
  const [stage] = await db.insert(schema.paymentStages).values({
    villaId,
    stageNo: overrides.stageNo ?? 1,
    stageName: overrides.stageName ?? "Stage 1",
    dueDate: overrides.dueDate ?? "2026-07-10",
    principalAmount: String(overrides.principalAmount ?? 2_000_000),
    gracePeriodDays: overrides.graceDays ?? 15,
  }).returning();
  return stage;
}

/**
 * `app_settings` and `interest_defaults` are singleton rows with no default for
 * `company_name` / the interest fields, so nothing creates them automatically — a real
 * Supabase project needs this same one-time seed at handover (see RUNBOOK.md).
 * Idempotent: safe to call from every test file's setup without erroring on a rerun.
 */
export async function seedWorkspaceSettings() {
  await db.execute(sql`
    INSERT INTO public.app_settings (id, company_name, date_format)
    VALUES (1, 'Test Company', 'dd/MM/yyyy')
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO public.interest_defaults (id, monthly_rate, grace_days, first_reminder_day, second_reminder_day, final_notice_day)
    VALUES (1, 0.015, 15, 14, 21, 28)
    ON CONFLICT (id) DO NOTHING
  `);
}

export async function setWorkspaceToday(date: string) {
  // `SET x = $1` is not valid Postgres syntax — a bound parameter needs set_config().
  // `false` for is_local means it persists for the whole session, matching the
  // transaction pooler's `prepare: false, max: 1` connection this app always uses.
  await db.execute(sql`SELECT set_config('app.workspace_today', ${date}, false)`);
}
