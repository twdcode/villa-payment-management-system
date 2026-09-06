import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { connection } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { fromOperationalStatus, toCollection, toCustomer, toDocumentLink, toGracePeriod, toInterestTerms, toNote, toPaymentSchedule, toProject, toReceipt, toReminderTemplate, toUser, toVilla } from "@/lib/repositories/supabase/mappers";
import { queryView, sql } from "@/lib/repositories/supabase/raw";
import { createPaymentRecordedNotification, notificationsForUser, syncNotifications } from "@/lib/notifications/notification-centre";
import { sendReminderEmail } from "@/lib/reminders/send";
import { paymentStatus } from "@/lib/finance/calculations";
import type { Collection, CollectionAllocation, Customer, MockDatabase, PaymentSchedule, Project, ReminderApproval, ReminderLog, ReminderTemplate, User, Villa, WorkspaceNotification, WorkspaceSettings } from "@/lib/domain/types";
import { NotImplementedError } from "@/lib/repositories/errors";

import type { Repository, ApplicationSettingsInput, CollectionInput, CollectionQuery, CollectionResult, CollectionUpdateInput, CustomerInput, CustomerUpdate, DocumentLinkInput, DocumentLinkUpdate, GracePeriodInput, InterestDefaultsInput, PaymentScheduleDefaultsInput, PaymentScheduleUpdateInput, ProjectInput, ProjectUpdate, ReminderApprovalInput, ReminderApprovalReviewInput, ReminderTemplateInput, UserInput, UserUpdate, VillaDetailsUpdate, VillaInterestTermsInput, VillaQuery, VillaSetupInput, VillaSetupResult } from "./contracts";

function validateProjectInput(input: ProjectInput | ProjectUpdate) {
  if ("name" in input && input.name !== undefined && input.name.trim().length < 2) {
    throw new Error("Project name must contain at least two characters.");
  }
  if ("location" in input && input.location !== undefined && input.location.trim().length < 2) {
    throw new Error("Project location must contain at least two characters.");
  }
  if ("plannedVillaCount" in input && input.plannedVillaCount !== undefined && (!Number.isInteger(input.plannedVillaCount) || input.plannedVillaCount < 1)) {
    throw new Error("Number of villas must be a whole number greater than zero.");
  }
}

function validateCustomerInput(input: CustomerInput) {
  if (input.fullName.trim().length < 2) throw new Error("Customer name must contain at least two characters.");
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Enter a valid customer email address.");
  if (input.phone.trim().length < 7) throw new Error("Enter a valid customer phone number.");
}

function validateDocumentUrl(url: string) {
  try { new URL(url); } catch { throw new Error("Enter a valid document link."); }
  if (!/^https?:\/\//i.test(url.trim())) throw new Error("Enter a valid document link.");
}

function validateDocumentLinkInput(input: DocumentLinkInput) {
  if (!input.name.trim()) throw new Error("Enter a document name.");
  if (!input.date) throw new Error("Select a document date.");
  validateDocumentUrl(input.url);
}

/**
 * A real `YYYY-MM-DD` calendar date.
 *
 * Both halves matter: the shape check rejects an empty string, and the round-trip rejects
 * a well-shaped impossible date (`2026-02-31`) and the garbled values a native date input
 * can produce when typed into quickly (`90120-02-06`).
 */
function isValidDateString(value: string | undefined | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateUserInput(input: UserInput | UserUpdate) {
  if (input.name.trim().length < 2) throw new Error("Full name must contain at least two characters.");
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Enter a valid email address.");
  // The password length rule lives in `createUser`: only account creation sets one.
}

function validateReminderTemplateInput(input: ReminderTemplateInput) {
  if (input.name.trim().length < 2) throw new Error("Template name must contain at least two characters.");
  if (!input.subject.trim()) throw new Error("Enter an email subject.");
  if (input.subject.trim().length > 120) throw new Error("Email subject cannot exceed 120 characters.");
  if (!input.message.trim()) throw new Error("Enter a reminder message.");
}

function validateGracePeriodInput(input: GracePeriodInput) {
  if (input.name.trim().length < 2) throw new Error("Grace period name must contain at least two characters.");
  if (!Number.isInteger(input.days) || input.days < 0) throw new Error("Number of days must be a non-negative whole number.");
  if (input.description.trim().length > 300) throw new Error("Description cannot exceed 300 characters.");
}

function validateInterestTerms(terms: { monthlyRate: number; gracePeriodDays: number; proRataDivisor: number; reminderDaysAfterDue: number; secondReminderDaysAfterDue: number; finalNoticeDaysAfterDue: number }) {
  if (terms.monthlyRate < 0 || terms.monthlyRate >= 1) throw new Error("Monthly interest rate must be between 0% and 100%.");
  if (!Number.isInteger(terms.gracePeriodDays) || terms.gracePeriodDays < 0) throw new Error("Grace period must be a non-negative whole number.");
  if (!Number.isInteger(terms.proRataDivisor) || terms.proRataDivisor < 1) throw new Error("Pro-rata divisor must be at least one day.");
  if (!Number.isInteger(terms.reminderDaysAfterDue) || !Number.isInteger(terms.secondReminderDaysAfterDue) || !Number.isInteger(terms.finalNoticeDaysAfterDue) || terms.reminderDaysAfterDue < 0 || terms.secondReminderDaysAfterDue < terms.reminderDaysAfterDue || terms.finalNoticeDaysAfterDue < terms.secondReminderDaysAfterDue) {
    throw new Error("Reminder days must be in chronological order.");
  }
}

/** Creates the `auth.users` row for a new app user, via the admin API. Server-only secret key. */
async function createAuthUser(email: string, temporaryPassword: string): Promise<string> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the sign-in account.");
  return data.user.id;
}

async function deleteAuthUser(authUserId: string): Promise<void> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await admin.auth.admin.deleteUser(authUserId);
}

async function isLastActiveSuperAdmin(userId: string): Promise<boolean> {
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "super_admin"), eq(schema.users.status, "active")));
  return admins.length === 1 && admins[0].id === userId;
}

/**
 * One row per mutation, per `DEVELOPMENT-PHASES.md` Phase 5 ("Every mutation writes to
 * `audit_log`"). `before`/`after` are JSONB snapshots so "what did this look like before
 * the edit?" never needs a replay. Takes an executor so it can run inside the same
 * transaction as the mutation it is recording, when one exists.
 */
async function writeAuditLog(
  executor: Pick<typeof db, "insert">,
  entry: { tableName: string; recordId: string; action: string; before?: unknown; after?: unknown; reason?: string; actorId?: string },
): Promise<void> {
  await executor.insert(schema.auditLog).values({
    tableName: entry.tableName,
    recordId: entry.recordId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason,
    actorId: entry.actorId,
  });
}

/** `workspace_today()` as a JS date string — the same overridable clock every view uses. */
async function getWorkspaceToday(): Promise<string> {
  const [row] = await queryView<{ today: string }>(sql`SELECT public.workspace_today() AS today`);
  return row.today;
}

/**
 * Fills in `readBy` from `notification_reads` (D1) for one user's view of a notification
 * list. `assembleDatabase()` never queries this table itself, so every caller that
 * surfaces notifications to a user must apply this — otherwise "mark as read" would never
 * appear to have taken effect on the next load.
 */
async function withReadState(notifications: WorkspaceNotification[], userId: string): Promise<WorkspaceNotification[]> {
  if (!notifications.length) return notifications;
  const keys = notifications.map((notification) => notification.id);
  const reads = await db.select({ notificationKey: schema.notificationReads.notificationKey })
    .from(schema.notificationReads)
    .where(and(eq(schema.notificationReads.userId, userId), inArray(schema.notificationReads.notificationKey, keys)));
  const readKeys = new Set(reads.map((row) => row.notificationKey));
  return notifications.map((notification) => readKeys.has(notification.id) ? { ...notification, readBy: [userId] } : notification);
}

/**
 * Collections for one or more villas, with their allocations attached.
 *
 * Shared by `getCollections` and `getDatabase` so the "active villas only" rule — a
 * cancelled villa's collections are hidden from view, though never deleted — exists in
 * one place.
 */
/**
 * Everything `getDatabase()` returns.
 *
 * Several components still call `getDatabase()` for the whole store (Phase 1 note: narrow
 * these once the app runs against Supabase end to end). Until then this assembles the same
 * shape the mock produces, from real tables and views.
 */
async function assembleDatabase(): Promise<MockDatabase> {
  // These reads are independent of each other, so they go out together rather than one
  // at a time. The database is ~60ms away (ap-south-1), and running them sequentially
  // meant every page paid 14 x 60ms in round trips before rendering: measured at ~1479ms
  // sequential vs ~482ms parallel against this project.
  //
  // This is only safe on the SESSION pooler (port 5432). On the transaction pooler
  // (6543) a concurrent burst like this hangs forever — see the measurements in
  // `lib/db/client.ts`. If someone ever moves DATABASE_URL back to 6543, this function
  // is the first thing that will stop working.
  const [
    today,
    userRows,
    projectRows,
    villaRows,
    customerRows,
    scheduleRows,
    collections,
    receiptRows,
    noteRows,
    documentRows,
    templateRows,
    reminderLogRows,
    reminderRequestRows,
    settings,
    activityEventRows,
  ] = await Promise.all([
    getWorkspaceToday(),
    // Only what attribution needs. Selecting the whole row here put every colleague's
    // email, role and account status into the HTML of every page — see `UserDirectoryEntry`.
    db.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users),
    db.select().from(schema.projects).where(isNull(schema.projects.deletedAt)),
    db
      .select({ villa: schema.villas, customerLink: schema.villaCustomers, terms: schema.villaInterestTerms })
      .from(schema.villas)
      .leftJoin(schema.villaCustomers, and(eq(schema.villaCustomers.villaId, schema.villas.id), isNull(schema.villaCustomers.unassignedAt)))
      .leftJoin(schema.villaInterestTerms, eq(schema.villaInterestTerms.villaId, schema.villas.id))
      .where(isNull(schema.villas.deletedAt)),
    db.select().from(schema.customers).where(isNull(schema.customers.deletedAt)),
    queryView<Parameters<typeof toPaymentSchedule>[0]>(sql`SELECT * FROM v_stage_position ORDER BY stage_no`),
    fetchCollections({}),
    queryView<{ id: string; number: string; collectionId: string; issuedAt: string; principalAmount: string; interestAmount: string; totalAmount: string }>(
      sql`SELECT * FROM v_receipts`,
    ),
    db.select().from(schema.notes).where(isNull(schema.notes.deletedAt)),
    db.select().from(schema.documents).where(isNull(schema.documents.deletedAt)),
    db.select().from(schema.reminderTemplates).where(isNull(schema.reminderTemplates.deletedAt)),
    db.select().from(schema.reminderLogs),
    db.select().from(schema.reminderRequests),
    assembleSettings(),
    db
      .select({ event: schema.activityEvents, collection: schema.collections })
      .from(schema.activityEvents)
      .leftJoin(schema.collections, eq(schema.collections.id, schema.activityEvents.collectionId))
      .where(eq(schema.activityEvents.type, "payment_recorded")),
  ]);

  const villas = villaRows.map((row) => toVilla({ ...row.villa, customerId: row.customerLink?.customerId ?? null }, row.terms));
  const schedules = scheduleRows.map(toPaymentSchedule);
  const receipts = receiptRows.map(toReceipt);
  const receiptsByCollection = new Map(receipts.map((receipt) => [receipt.collectionId, receipt]));

  const database: MockDatabase = {
    today,
    users: userRows,
    projects: projectRows.map(toProject),
    villas,
    // PII stripped: see `CustomerSummary`. Full records come from `getCustomers()`.
    customers: customerRows.map(toCustomer).map(({ nicPassport: _nic, address: _address, ...summary }) => summary),
    schedules,
    collections,
    receipts,
    notes: noteRows.map(toNote),
    documents: documentRows.map(toDocumentLink),
    reminderTemplates: templateRows.map(toReminderTemplate),
    reminderLogs: reminderLogRows.map((row) => ({
      id: row.id,
      templateId: row.templateId ?? "",
      scheduleId: row.paymentStageId ?? "",
      customerId: row.customerId,
      sentAt: row.sentAt.toISOString(),
      sentBy: row.sentBy ?? "",
      deliveryStatus: (row.deliveryStatus === "delivered" ? "sent" : row.deliveryStatus === "pending" ? "pending" : "failed") as ReminderLog["deliveryStatus"],
    })),
    reminderApprovals: reminderRequestRows.map(toReminderApproval),
    notifications: [],
    settings,
  };

  // Stored events (D1): a payment_recorded row per activity_events entry, reusing the
  // exact formatter the mock uses so the message text cannot drift between data sources.
  const paymentRecordedNotifications = activityEventRows
    .filter((row): row is typeof row & { collection: NonNullable<typeof row.collection> } => row.collection !== null)
    .map((row) => {
      const collection = database.collections.find((candidate) => candidate.id === row.collection.id);
      const receipt = receiptsByCollection.get(row.collection.id);
      if (!collection || !receipt) return null;
      const eventDate = row.event.createdAt.toISOString().slice(0, 10);
      return createPaymentRecordedNotification(database, collection, receipt, eventDate);
    })
    .filter((notification): notification is WorkspaceNotification => notification !== null);

  database.notifications = syncNotifications({ ...database, notifications: paymentRecordedNotifications }, today);

  return database;
}

/** `WorkspaceSettings`, assembled from the singleton settings tables plus lookup tables. */
function toReminderApproval(row: {
  id: string;
  villaId: string;
  customerId: string;
  sendDate: Date | string;
  requestedBy: string | null;
  requestedAt: Date | string;
  status: string;
  templateId: string | null;
  subject: string;
  message: string;
  attachmentName: string | null;
  attachmentUrl: string | null;
}): ReminderApproval {
  return {
    id: row.id,
    customerId: row.customerId,
    villaId: row.villaId,
    sendDate: row.sendDate instanceof Date ? row.sendDate.toISOString().slice(0, 10) : row.sendDate,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt instanceof Date ? row.requestedAt.toISOString() : row.requestedAt,
    status: row.status as ReminderApproval["status"],
    ...(row.templateId ? { templateId: row.templateId } : {}),
    ...(row.subject ? { subject: row.subject } : {}),
    ...(row.message ? { message: row.message } : {}),
    ...(row.attachmentName ? { attachmentName: row.attachmentName } : {}),
    ...(row.attachmentUrl ? { attachmentUrl: row.attachmentUrl } : {}),
  };
}

/**
 * Makes one grace period the default: `isDefault` on it alone, force it active, and
 * mirror its days onto `interest_defaults` so the two never disagree.
 */
async function applyGracePeriodDefault(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], defaultId: string): Promise<void> {
  const [selected] = await tx.select().from(schema.gracePeriods).where(eq(schema.gracePeriods.id, defaultId));
  if (!selected) throw new Error("Grace period not found.");
  await tx.update(schema.gracePeriods).set({ isDefault: false }).where(eq(schema.gracePeriods.isDefault, true));
  await tx.update(schema.gracePeriods).set({ isDefault: true, isActive: true }).where(eq(schema.gracePeriods.id, defaultId));
  await tx.update(schema.interestDefaults).set({ graceDays: selected.days }).where(eq(schema.interestDefaults.id, 1));
}

/**
 * Takes an executor so a caller already inside `db.transaction(async (tx) => ...)` can
 * pass `tx` instead of the module-level `db`. The connection pool is `max: 1` (see
 * db/client.ts) — a `db.transaction` holds that one connection for its whole duration,
 * so a nested call using `db` instead of `tx` cannot acquire a second connection and
 * deadlocks forever. Every call site inside a transaction MUST pass `tx` here.
 */
/**
 * `app_settings` and `interest_defaults` are true singletons — `id` is a `smallint`
 * pinned to 1 by a CHECK constraint, never a row identity in the normal sense.
 * `audit_log.record_id` is `uuid`, so the literal string `"1"` fails Postgres's UUID
 * cast on every write to either table's audit entry. The nil UUID is a fixed, documented
 * sentinel: it lets every audit row for one of these tables still be queried by
 * `record_id`, without inventing a fake random identity for a row that only ever has one.
 */
const SINGLETON_AUDIT_RECORD_ID = "00000000-0000-0000-0000-000000000000";

async function assembleSettings(executor: Pick<typeof db, "select"> = db): Promise<WorkspaceSettings> {
  const [[appRow], [interestRow], graceRows, templateRows] = await Promise.all([
    executor.select().from(schema.appSettings),
    executor.select().from(schema.interestDefaults),
    executor.select().from(schema.gracePeriods).where(isNull(schema.gracePeriods.deletedAt)),
    executor.select().from(schema.projectScheduleTemplates),
  ]);

  const defaultsByProject = new Map<string, { projectId: string; stages: { id: string; stage: string; deliverables?: string; gracePeriodDays: number }[] }>();
  for (const row of templateRows) {
    const entry = defaultsByProject.get(row.projectId) ?? { projectId: row.projectId, stages: [] };
    entry.stages.push({
      id: row.id,
      stage: row.stageName,
      ...(row.deliverables ? { deliverables: row.deliverables } : {}),
      gracePeriodDays: row.gracePeriodDays,
    });
    defaultsByProject.set(row.projectId, entry);
  }

  return {
    companyName: appRow.companyName,
    currency: "LKR",
    timezone: appRow.timezone,
    dateFormat: appRow.dateFormat,
    receiptPrefix: appRow.receiptPrefix,
    ...(appRow.replyToEmail ? { replyToEmail: appRow.replyToEmail } : {}),
    defaultChargeLatePaymentInterest: interestRow.chargeInterest,
    defaultInterestTerms: toInterestTerms(interestRow),
    gracePeriods: graceRows.map(toGracePeriod),
    projectPaymentScheduleDefaults: [...defaultsByProject.values()],
  };
}

async function fetchCollections(query: CollectionQuery): Promise<Collection[]> {
  const conditions = [isNull(schema.collections.supersededAt), eq(schema.villas.programmeStatus, "active")];
  if (query.projectId) conditions.push(eq(schema.villas.projectId, query.projectId));
  if (query.villaId) conditions.push(eq(schema.collections.villaId, query.villaId));
  if (query.customerId) conditions.push(eq(schema.collections.customerId, query.customerId));
  if (query.status) conditions.push(eq(schema.collections.status, query.status));

  const rows = await db
    .select({ collection: schema.collections, projectId: schema.villas.projectId })
    .from(schema.collections)
    .innerJoin(schema.villas, eq(schema.villas.id, schema.collections.villaId))
    .where(and(...conditions));

  if (!rows.length) return [];

  const collectionIds = rows.map((row) => row.collection.id);
  const allocationRows = await db
    .select()
    .from(schema.collectionAllocations)
    .where(inArray(schema.collectionAllocations.collectionId, collectionIds));

  const allocationsByCollection = new Map<string, CollectionAllocation[]>();
  for (const allocation of allocationRows) {
    const list = allocationsByCollection.get(allocation.collectionId) ?? [];
    list.push({
      scheduleId: allocation.paymentStageId,
      principalAmount: Number(allocation.principalAmount),
      interestAmount: Number(allocation.interestAmount),
    });
    allocationsByCollection.set(allocation.collectionId, list);
  }

  return rows.map((row) =>
    toCollection({ ...row.collection, projectId: row.projectId }, allocationsByCollection.get(row.collection.id) ?? []),
  );
}

/**
 * Supabase-backed implementation of the Repository contract.
 *
 * Every method is a stub until its phase lands. The class exists now so the factory can
 * select an implementation and so any accidental early use fails loudly instead of
 * silently falling back to mock data. Phases 4-6 fill these in.
 */
export class SupabaseRepository implements Repository {
  signIn(_email: string, _password: string): Promise<User> {
    throw new NotImplementedError("signIn");
  }

  signOut(): Promise<void> {
    throw new NotImplementedError("signOut");
  }

  async mustChangePassword(): Promise<boolean> {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const metadata = (data?.claims?.app_metadata ?? {}) as { must_change_password?: boolean };
    return metadata.must_change_password === true;
  }

  changePassword(_currentPassword: string, _newPassword: string): Promise<void> {
    throw new NotImplementedError("changePassword");
  }

  requestPasswordReset(_email: string): Promise<void> {
    throw new NotImplementedError("requestPasswordReset");
  }

  completePasswordReset(_newPassword: string): Promise<void> {
    throw new NotImplementedError("completePasswordReset");
  }

  async getCurrentUser(): Promise<User> {
    const user = await getSessionUser();
    if (!user) throw new Error("Not signed in.");
    return user;
  }

  async listUsersForAccessControl(): Promise<User[]> {
    const rows = await db.select().from(schema.users);
    return rows.map(toUser);
  }

  async createUser(input: UserInput): Promise<User> {
    validateUserInput(input);
    if (input.temporaryPassword.length < 8) throw new Error("Temporary password must contain at least 8 characters.");
    const email = input.email.trim();
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (existing) throw new Error("A user with this email address already exists.");

    const authUserId = await createAuthUser(email, input.temporaryPassword);
    try {
      const [row] = await db.insert(schema.users).values({ authUserId, fullName: input.name.trim(), email, role: input.role }).returning();
      await writeAuditLog(db, { tableName: "users", recordId: row.id, action: "create", after: row, actorId: (await this.getCurrentUser().catch(() => null))?.id });
      return toUser(row);
    } catch (error) {
      await deleteAuthUser(authUserId);
      throw error;
    }
  }

  async updateUser(id: string, input: UserUpdate): Promise<User> {
    validateUserInput(input);
    const email = input.email.trim();
    const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!current) throw new Error("User not found.");
    const [emailClash] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, email)));
    if (emailClash && emailClash.id !== id) throw new Error("A user with this email address already exists.");
    if (current.role === "super_admin" && input.role !== "super_admin" && (await isLastActiveSuperAdmin(id))) {
      throw new Error("Assign another active Super Admin before changing this role.");
    }
    const [row] = await db.update(schema.users).set({ fullName: input.name.trim(), email, role: input.role }).where(eq(schema.users.id, id)).returning();
    await writeAuditLog(db, { tableName: "users", recordId: id, action: "update", before: current, after: row, actorId: (await this.getCurrentUser().catch(() => null))?.id });
    return toUser(row);
  }

  async setUserActive(id: string, isActive: boolean): Promise<User> {
    const currentUser = await this.getCurrentUser();
    if (!isActive && id === currentUser.id) throw new Error("You cannot disable your own account.");
    const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!current) throw new Error("User not found.");
    if (!isActive && (await isLastActiveSuperAdmin(id))) throw new Error("At least one Super Admin must remain active.");
    const [row] = await db.update(schema.users).set({ status: isActive ? "active" : "disabled" }).where(eq(schema.users.id, id)).returning();
    await writeAuditLog(db, { tableName: "users", recordId: id, action: isActive ? "activate" : "deactivate", before: current, after: row, actorId: currentUser.id });
    return toUser(row);
  }

  async deleteUser(id: string): Promise<void> {
    const currentUser = await this.getCurrentUser();
    if (id === currentUser.id) throw new Error("You cannot delete your own account.");
    const [current] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    if (!current) throw new Error("User not found.");
    if (await isLastActiveSuperAdmin(id)) throw new Error("At least one Super Admin must remain active.");
    // No hard deletes: disable and let the row and its history stand.
    await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, id));
    await writeAuditLog(db, { tableName: "users", recordId: id, action: "delete", before: current, actorId: currentUser.id });
    await deleteAuthUser(current.authUserId);
  }

  async getProjects(): Promise<Project[]> {
    const rows = await db.select().from(schema.projects).where(isNull(schema.projects.deletedAt));
    return rows.map(toProject);
  }

  async getProject(id: string): Promise<Project | null> {
    const [row] = await db.select().from(schema.projects)
      .where(and(eq(schema.projects.id, id), isNull(schema.projects.deletedAt)));
    return row ? toProject(row) : null;
  }

  async createProject(input: ProjectInput): Promise<Project> {
    validateProjectInput(input);
    const currentUser = await this.getCurrentUser();
    const [row] = await db.insert(schema.projects).values({
      name: input.name.trim(),
      location: input.location.trim(),
      status: input.status,
      plannedVillaCount: input.plannedVillaCount,
      createdBy: currentUser.id,
    }).returning();
    await writeAuditLog(db, { tableName: "projects", recordId: row.id, action: "create", after: row, actorId: currentUser.id });
    return toProject(row);
  }

  async updateProject(id: string, input: ProjectUpdate): Promise<Project> {
    validateProjectInput(input);
    const currentUser = await this.getCurrentUser();
    const [current] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, id), isNull(schema.projects.deletedAt)));
    if (!current) throw new Error("Project not found.");
    const [row] = await db.update(schema.projects).set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.plannedVillaCount !== undefined ? { plannedVillaCount: input.plannedVillaCount } : {}),
    }).where(eq(schema.projects.id, id)).returning();
    await writeAuditLog(db, { tableName: "projects", recordId: id, action: "update", before: current, after: row, actorId: currentUser.id });
    return toProject(row);
  }

  async getVillas(query?: VillaQuery): Promise<Villa[]> {
    const conditions = [isNull(schema.villas.deletedAt)];
    if (query?.projectId) conditions.push(eq(schema.villas.projectId, query.projectId));

    const rows = await db
      .select({ villa: schema.villas, customerLink: schema.villaCustomers, terms: schema.villaInterestTerms })
      .from(schema.villas)
      .leftJoin(
        schema.villaCustomers,
        and(eq(schema.villaCustomers.villaId, schema.villas.id), isNull(schema.villaCustomers.unassignedAt)),
      )
      .leftJoin(schema.villaInterestTerms, eq(schema.villaInterestTerms.villaId, schema.villas.id))
      .where(and(...conditions));

    let villas = rows.map((row) =>
      toVilla({ ...row.villa, customerId: row.customerLink?.customerId ?? null }, row.terms),
    );

    // `status` filters on the derived operationalStatus, which combines two columns
    // (C4) — applied after mapping so "cancelled" and the four sale statuses use the
    // exact same rule the frontend already reads.
    if (query?.status) villas = villas.filter((villa) => villa.operationalStatus === query.status);
    if (query?.customerId) villas = villas.filter((villa) => villa.customerId === query.customerId);

    return villas;
  }

  async getVilla(id: string): Promise<Villa | null> {
    const [row] = await db
      .select({ villa: schema.villas, customerLink: schema.villaCustomers, terms: schema.villaInterestTerms })
      .from(schema.villas)
      .leftJoin(
        schema.villaCustomers,
        and(eq(schema.villaCustomers.villaId, schema.villas.id), isNull(schema.villaCustomers.unassignedAt)),
      )
      .leftJoin(schema.villaInterestTerms, eq(schema.villaInterestTerms.villaId, schema.villas.id))
      .where(and(eq(schema.villas.id, id), isNull(schema.villas.deletedAt)));

    if (!row) return null;
    return toVilla({ ...row.villa, customerId: row.customerLink?.customerId ?? null }, row.terms);
  }

  async getCustomers(): Promise<Customer[]> {
    const rows = await db.select().from(schema.customers).where(isNull(schema.customers.deletedAt));
    return rows.map(toCustomer);
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const [row] = await db.select().from(schema.customers)
      .where(and(eq(schema.customers.id, id), isNull(schema.customers.deletedAt)));
    return row ? toCustomer(row) : null;
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    validateCustomerInput(input);
    const email = input.email.trim();
    // Case-insensitive: matches the local-storage repository's `toLocaleLowerCase()`
    // check, and a bare `eq()` here would let "a@b.com" and "A@B.com" both be created.
    const [existing] = await db.select({ id: schema.customers.id }).from(schema.customers)
      .where(and(sql`lower(${schema.customers.email}) = lower(${email})`, isNull(schema.customers.deletedAt)));
    if (existing) throw new Error("A customer with this email already exists.");
    const currentUser = await this.getCurrentUser();
    const [row] = await db.insert(schema.customers).values({
      fullName: input.fullName.trim(),
      email,
      phone: input.phone.trim(),
      nicPassport: input.nicPassport?.trim() || undefined,
      address: input.address?.trim() || undefined,
      createdBy: currentUser.id,
    }).returning();
    await writeAuditLog(db, { tableName: "customers", recordId: row.id, action: "create", after: row, actorId: currentUser.id });
    return toCustomer(row);
  }

  async updateCustomer(id: string, input: CustomerUpdate): Promise<Customer> {
    const currentUser = await this.getCurrentUser();
    const [current] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, id), isNull(schema.customers.deletedAt)));
    if (!current) throw new Error("Customer not found.");
    const next = {
      fullName: input.fullName?.trim() ?? current.fullName,
      email: input.email?.trim() ?? current.email ?? "",
      phone: input.phone?.trim() ?? current.phone ?? "",
    };
    validateCustomerInput(next);
    // Case-insensitive, same reasoning as createCustomer above.
    const [emailClash] = await db.select({ id: schema.customers.id }).from(schema.customers)
      .where(and(sql`lower(${schema.customers.email}) = lower(${next.email})`, isNull(schema.customers.deletedAt)));
    if (emailClash && emailClash.id !== id) throw new Error("A customer with this email already exists.");
    const [row] = await db.update(schema.customers).set({
      fullName: next.fullName,
      email: next.email,
      phone: next.phone,
      ...(input.nicPassport !== undefined ? { nicPassport: input.nicPassport.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
    }).where(eq(schema.customers.id, id)).returning();
    await writeAuditLog(db, { tableName: "customers", recordId: id, action: "update", before: current, after: row, actorId: currentUser.id });
    return toCustomer(row);
  }

  async completeVillaSetup(input: VillaSetupInput): Promise<VillaSetupResult> {
    if (input.number.trim().length < 1) throw new Error("Villa number is required.");
    if (input.type.trim().length < 1) throw new Error("Villa type is required.");
    if (!Number.isFinite(input.value) || input.value <= 0) throw new Error("Villa value must be greater than zero.");
    if (input.customerId && input.newCustomer) throw new Error("Choose an existing customer or add a new one, not both.");
    if (input.newCustomer) validateCustomerInput(input.newCustomer);
    if (input.schedules?.length) {
      const total = input.schedules.reduce((sum, schedule) => sum + schedule.principalAmount, 0);
      if (Math.abs(total - input.value) > 0.01) throw new Error("Payment schedule total must equal the villa value.");
      if (input.schedules.some((schedule) => !schedule.stage.trim() || !schedule.dueDate || schedule.principalAmount <= 0 || schedule.gracePeriodDays < 0)) throw new Error("Complete every payment schedule item before saving.");
    }

    const currentUser = await this.getCurrentUser();
    const [project] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, input.projectId), isNull(schema.projects.deletedAt)));
    if (!project) throw new Error("Select a valid project.");

    const [numberClash] = await db.select({ id: schema.villas.id }).from(schema.villas).where(and(eq(schema.villas.projectId, input.projectId), eq(schema.villas.villaNumber, input.number.trim()), isNull(schema.villas.deletedAt)));
    if (numberClash) throw new Error("A villa with this number already exists in the selected project.");

    if (input.customerId) {
      const [existingCustomer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, input.customerId), isNull(schema.customers.deletedAt)));
      if (!existingCustomer) throw new Error("Select a valid customer.");
    }

    const { saleStatus, programmeStatus } = fromOperationalStatus(input.operationalStatus);

    return db.transaction(async (tx) => {
      let customer: Customer | null = null;
      if (input.newCustomer) {
        const [clash] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.email, input.newCustomer.email.trim()), isNull(schema.customers.deletedAt)));
        if (clash) throw new Error("A customer with this email already exists.");
        const [row] = await tx.insert(schema.customers).values({
          fullName: input.newCustomer.fullName.trim(),
          email: input.newCustomer.email.trim(),
          phone: input.newCustomer.phone.trim(),
          nicPassport: input.newCustomer.nicPassport?.trim() || undefined,
          address: input.newCustomer.address?.trim() || undefined,
          createdBy: currentUser.id,
        }).returning();
        customer = toCustomer(row);
      } else if (input.customerId) {
        const [row] = await tx.select().from(schema.customers).where(eq(schema.customers.id, input.customerId));
        customer = row ? toCustomer(row) : null;
      }

      const [villaRow] = await tx.insert(schema.villas).values({
        projectId: input.projectId,
        villaNumber: input.number.trim(),
        villaType: input.type.trim(),
        villaValue: String(input.value),
        saleStatus,
        programmeStatus,
        createdBy: currentUser.id,
      }).returning();

      if (customer) {
        await tx.insert(schema.villaCustomers).values({ villaId: villaRow.id, customerId: customer.id, assignedBy: currentUser.id });
      }

      let interestTermsRow: typeof schema.villaInterestTerms.$inferSelect | undefined;
      if (input.chargeLatePaymentInterest !== undefined || input.interestTerms) {
        const [defaults] = await tx.select().from(schema.interestDefaults);
        const merged = {
          chargeInterest: input.chargeLatePaymentInterest ?? defaults.chargeInterest,
          monthlyRate: input.interestTerms?.monthlyRate !== undefined ? String(input.interestTerms.monthlyRate) : defaults.monthlyRate,
          graceDays: input.interestTerms?.gracePeriodDays ?? defaults.graceDays,
          prorataDivisor: input.interestTerms?.proRataDivisor ?? defaults.prorataDivisor,
          interestStart: input.interestTerms?.interestStart ?? defaults.interestStart,
          allocationOrder: input.interestTerms?.allocationOrder ?? defaults.allocationOrder,
          firstReminderDay: input.interestTerms?.reminderDaysAfterDue ?? defaults.firstReminderDay,
          secondReminderDay: input.interestTerms?.secondReminderDaysAfterDue ?? defaults.secondReminderDay,
          finalNoticeDay: input.interestTerms?.finalNoticeDaysAfterDue ?? defaults.finalNoticeDay,
        };
        [interestTermsRow] = await tx.insert(schema.villaInterestTerms).values({ villaId: villaRow.id, ...merged, updatedBy: currentUser.id }).returning();
      }

      const villa = toVilla({ ...villaRow, customerId: customer?.id ?? null }, interestTermsRow);

      const schedules: PaymentSchedule[] = [];
      if (input.schedules?.length) {
        const stageRows = await tx.insert(schema.paymentStages).values(input.schedules.map((schedule, index) => ({
          villaId: villaRow.id,
          stageNo: index + 1,
          stageName: schedule.stage.trim(),
          deliverables: schedule.deliverables?.trim() || undefined,
          dueDate: schedule.dueDate,
          principalAmount: String(schedule.principalAmount),
          gracePeriodDays: schedule.gracePeriodDays,
          createdBy: currentUser.id,
        }))).returning();
        for (const row of stageRows) {
          schedules.push({
            id: row.id,
            villaId: row.villaId,
            stage: row.stageName,
            ...(row.deliverables ? { deliverables: row.deliverables } : {}),
            dueDate: row.dueDate ?? "",
            gracePeriodDays: row.gracePeriodDays,
            principalAmount: Number(row.principalAmount),
            principalPaid: 0,
            interestAccrued: 0,
            interestPaid: 0,
            status: "not_due",
          });
        }
      }

      await writeAuditLog(tx, { tableName: "villas", recordId: villaRow.id, action: "create", after: villaRow, actorId: currentUser.id });
      return { villa, customer, schedules };
    });
  }

  async updateVilla(villaId: string, input: VillaDetailsUpdate): Promise<Villa> {
    if (!input.number.trim()) throw new Error("Villa number is required.");
    if (!input.type.trim()) throw new Error("Villa type is required.");
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!before) throw new Error("Villa not found.");
      if (before.programmeStatus === "cancelled") throw new Error("This villa programme is cancelled and cannot be edited.");

      const [numberClash] = await tx.select({ id: schema.villas.id }).from(schema.villas).where(and(
        eq(schema.villas.projectId, before.projectId),
        eq(schema.villas.villaNumber, input.number.trim()),
        ne(schema.villas.id, villaId),
        isNull(schema.villas.deletedAt),
      ));
      if (numberClash) throw new Error("A villa with this number already exists in the selected project.");

      const [after] = await tx.update(schema.villas).set({
        villaNumber: input.number.trim(),
        villaType: input.type.trim(),
        saleStatus: input.saleStatus,
      }).where(eq(schema.villas.id, villaId)).returning();

      await writeAuditLog(tx, { tableName: "villas", recordId: villaId, action: "update", before, after, actorId: currentUser.id });

      const [customerLink] = await tx.select().from(schema.villaCustomers).where(and(eq(schema.villaCustomers.villaId, villaId), isNull(schema.villaCustomers.unassignedAt)));
      const [terms] = await tx.select().from(schema.villaInterestTerms).where(eq(schema.villaInterestTerms.villaId, villaId));
      return toVilla({ ...after, customerId: customerLink?.customerId ?? null }, terms);
    });
  }

  async reassignVillaCustomer(villaId: string, input: { customerId?: string; newCustomer?: CustomerInput }): Promise<{ villa: Villa; customer: Customer | null }> {
    if (input.customerId && input.newCustomer) throw new Error("Choose an existing customer or add a new one, not both.");
    if (input.newCustomer) validateCustomerInput(input.newCustomer);
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [villa] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!villa) throw new Error("Villa not found.");
      if (villa.programmeStatus === "cancelled") throw new Error("This villa programme is cancelled and cannot be reassigned.");

      let customer: Customer | null = null;
      if (input.newCustomer) {
        const [clash] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.email, input.newCustomer.email.trim()), isNull(schema.customers.deletedAt)));
        if (clash) throw new Error("A customer with this email already exists.");
        const [row] = await tx.insert(schema.customers).values({
          fullName: input.newCustomer.fullName.trim(),
          email: input.newCustomer.email.trim(),
          phone: input.newCustomer.phone.trim(),
          nicPassport: input.newCustomer.nicPassport?.trim() || undefined,
          address: input.newCustomer.address?.trim() || undefined,
          createdBy: currentUser.id,
        }).returning();
        customer = toCustomer(row);
      } else if (input.customerId) {
        const [row] = await tx.select().from(schema.customers).where(and(eq(schema.customers.id, input.customerId), isNull(schema.customers.deletedAt)));
        if (!row) throw new Error("Select a valid customer.");
        customer = toCustomer(row);
      }

      // Close the current assignment (if any) and open a new one, rather than update it in
      // place — this is the history the PRD requires: "changing a customer assignment must
      // not remove historical payment activity." Collections stay linked to the customer id
      // that was live when they were recorded, never to whichever assignment row exists now.
      const [previousLink] = await tx.select().from(schema.villaCustomers).where(and(eq(schema.villaCustomers.villaId, villaId), isNull(schema.villaCustomers.unassignedAt)));
      if (previousLink && previousLink.customerId === customer?.id) {
        throw new Error("This customer is already assigned to the villa.");
      }
      if (previousLink) {
        await tx.update(schema.villaCustomers).set({ unassignedAt: new Date(), unassignedBy: currentUser.id }).where(eq(schema.villaCustomers.id, previousLink.id));
      }
      if (customer) {
        await tx.insert(schema.villaCustomers).values({ villaId, customerId: customer.id, assignedBy: currentUser.id });
      }

      await writeAuditLog(tx, {
        tableName: "villa_customers",
        recordId: villaId,
        action: "update",
        before: { customerId: previousLink?.customerId ?? null },
        after: { customerId: customer?.id ?? null },
        actorId: currentUser.id,
      });

      const [terms] = await tx.select().from(schema.villaInterestTerms).where(eq(schema.villaInterestTerms.villaId, villaId));
      return { villa: toVilla({ ...villa, customerId: customer?.id ?? null }, terms), customer };
    });
  }

  async getSchedules(villaId?: string): Promise<PaymentSchedule[]> {
    const where = villaId ? sql`WHERE villa_id = ${villaId}` : sql``;
    const rows = await queryView<Parameters<typeof toPaymentSchedule>[0]>(
      sql`SELECT * FROM v_stage_position ${where} ORDER BY stage_no`,
    );
    return rows.map(toPaymentSchedule);
  }

  async updatePaymentSchedule(villaId: string, schedules: PaymentScheduleUpdateInput[]): Promise<PaymentSchedule[]> {
    if (!schedules.length) throw new Error("Add at least one payment stage.");
    if (schedules.some((schedule) => !schedule.stage.trim() || schedule.principalAmount < 0 || schedule.gracePeriodDays < 0)) {
      throw new Error("Each stage needs a name, non-negative amount, and valid grace period.");
    }
    // Checked here, not left to Postgres: an empty or malformed date reached the insert and
    // came back as a raw "Failed query: insert into payment_stages ..." on the user's screen.
    if (schedules.some((schedule) => !isValidDateString(schedule.dueDate))) {
      throw new Error("Each stage needs a valid due date.");
    }
    const total = schedules.reduce((sum, schedule) => sum + schedule.principalAmount, 0);
    const today = await getWorkspaceToday();
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [villa] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!villa) throw new Error("Villa not found.");
      // Cancelling a programme promises it "stops schedule changes" — enforce that here,
      // not only by disabling the button. Same guard as `updateVilla`.
      if (villa.programmeStatus === "cancelled") throw new Error("This villa programme is cancelled and its payment schedule cannot be changed.");
      if (total > Number(villa.villaValue)) throw new Error("Payment schedule total cannot exceed the villa value.");

      const existing = await tx.select().from(schema.paymentStages).where(eq(schema.paymentStages.villaId, villaId));
      const existingById = new Map(existing.map((row) => [row.id, row]));
      const retainedIds = new Set(schedules.flatMap((schedule) => (schedule.id ? [schedule.id] : [])));
      if (retainedIds.size !== schedules.filter((schedule) => schedule.id).length) throw new Error("A payment stage appears more than once.");

      for (const row of existing) {
        if (retainedIds.has(row.id)) continue;
        const [alloc] = await tx.select({ id: schema.collectionAllocations.id }).from(schema.collectionAllocations).where(eq(schema.collectionAllocations.paymentStageId, row.id)).limit(1);
        if (Number(row.principalPaid) > 0 || Number(row.interestPaid) > 0 || alloc) {
          throw new Error(`Cannot remove ${row.stageName} because it has recorded payments.`);
        }
      }
      for (const schedule of schedules) {
        if (!schedule.id) continue;
        const current = existingById.get(schedule.id);
        if (current && schedule.principalAmount < Number(current.principalPaid)) {
          throw new Error(`${current.stageName} cannot be reduced below its paid amount.`);
        }
      }

      await tx.delete(schema.paymentStages).where(and(eq(schema.paymentStages.villaId, villaId), inArray(schema.paymentStages.id, existing.filter((row) => !retainedIds.has(row.id)).map((row) => row.id))));

      const updated: PaymentSchedule[] = [];
      for (const [index, schedule] of schedules.entries()) {
        const current = schedule.id ? existingById.get(schedule.id) : undefined;
        const values = {
          villaId,
          stageNo: index + 1,
          stageName: schedule.stage.trim(),
          deliverables: schedule.deliverables?.trim() || undefined,
          dueDate: schedule.dueDate,
          principalAmount: String(schedule.principalAmount),
          gracePeriodDays: schedule.gracePeriodDays,
        };
        const row = current
          ? (await tx.update(schema.paymentStages).set(values).where(eq(schema.paymentStages.id, current.id)).returning())[0]
          : (await tx.insert(schema.paymentStages).values(values).returning())[0];
        const next: PaymentSchedule = {
          id: row.id,
          villaId: row.villaId,
          stage: row.stageName,
          ...(row.deliverables ? { deliverables: row.deliverables } : {}),
          dueDate: row.dueDate ?? "",
          gracePeriodDays: row.gracePeriodDays,
          principalAmount: Number(row.principalAmount),
          principalPaid: Number(row.principalPaid),
          interestAccrued: Number(row.interestCharged) - Number(row.interestPaid),
          interestPaid: Number(row.interestPaid),
          status: "not_due",
        };
        updated.push({ ...next, status: paymentStatus(next, today) });
      }
      await writeAuditLog(tx, { tableName: "payment_stages", recordId: villaId, action: "update", before: existing, after: updated, actorId: currentUser.id });
      return updated;
    });
  }

  async updateVillaInterestTerms(villaId: string, input: VillaInterestTermsInput): Promise<Villa> {
    validateInterestTerms(input.interestTerms);
    const currentUser = await this.getCurrentUser();
    return db.transaction(async (tx) => {
      const [villa] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!villa) throw new Error("Villa not found.");
      if (villa.programmeStatus === "cancelled") throw new Error("This villa programme is cancelled and its interest terms cannot be changed.");

      const values = {
        chargeInterest: input.chargeLatePaymentInterest,
        monthlyRate: String(input.interestTerms.monthlyRate),
        graceDays: input.interestTerms.gracePeriodDays,
        prorataDivisor: input.interestTerms.proRataDivisor,
        interestStart: input.interestTerms.interestStart,
        allocationOrder: input.interestTerms.allocationOrder,
        firstReminderDay: input.interestTerms.reminderDaysAfterDue,
        secondReminderDay: input.interestTerms.secondReminderDaysAfterDue,
        finalNoticeDay: input.interestTerms.finalNoticeDaysAfterDue,
        updatedBy: currentUser.id,
      };
      const [existing] = await tx.select().from(schema.villaInterestTerms).where(eq(schema.villaInterestTerms.villaId, villaId));
      const termsRow = existing
        ? (await tx.update(schema.villaInterestTerms).set(values).where(eq(schema.villaInterestTerms.villaId, villaId)).returning())[0]
        : (await tx.insert(schema.villaInterestTerms).values({ villaId, ...values }).returning())[0];
      await writeAuditLog(tx, { tableName: "villa_interest_terms", recordId: villaId, action: existing ? "update" : "create", before: existing, after: termsRow, actorId: currentUser.id });

      const [customerLink] = await tx.select().from(schema.villaCustomers).where(and(eq(schema.villaCustomers.villaId, villaId), isNull(schema.villaCustomers.unassignedAt)));
      return toVilla({ ...villa, customerId: customerLink?.customerId ?? null }, termsRow);
    });
  }

  async addVillaDocument(villaId: string, input: DocumentLinkInput): Promise<void> {
    validateDocumentLinkInput(input);
    const currentUser = await this.getCurrentUser();
    const [villa] = await db.select({ id: schema.villas.id }).from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
    if (!villa) throw new Error("Villa not found.");
    await db.insert(schema.documents).values({ villaId, name: input.name.trim(), documentDate: input.date, url: input.url.trim(), addedBy: currentUser.id });
  }

  async updateVillaDocument(documentId: string, input: DocumentLinkUpdate): Promise<void> {
    if (input.name !== undefined && !input.name.trim()) throw new Error("Enter a document name.");
    if (input.date !== undefined && !input.date) throw new Error("Select a document date.");
    if (input.url !== undefined) validateDocumentUrl(input.url);
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), isNull(schema.documents.deletedAt)));
      if (!before) throw new Error("Document not found.");

      const [after] = await tx.update(schema.documents).set({
        name: input.name?.trim() ?? before.name,
        documentDate: input.date ?? before.documentDate,
        url: input.url?.trim() ?? before.url,
      }).where(eq(schema.documents.id, documentId)).returning();

      await writeAuditLog(tx, { tableName: "documents", recordId: documentId, action: "update", before, after, actorId: currentUser.id });
    });
  }

  async deleteVillaDocument(documentId: string, reason: string): Promise<void> {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) throw new Error("Enter a reason for removing this document.");
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.documents).where(and(eq(schema.documents.id, documentId), isNull(schema.documents.deletedAt)));
      if (!before) throw new Error("Document not found.");

      // Soft delete only, and only the reference — the PRD is explicit that this never
      // touches the external file the link points to.
      await tx.update(schema.documents).set({ deletedAt: new Date() }).where(eq(schema.documents.id, documentId));
      await writeAuditLog(tx, { tableName: "documents", recordId: documentId, action: "delete", before, reason: trimmedReason, actorId: currentUser.id });
    });
  }

  async addVillaNote(villaId: string, content: string): Promise<void> {
    const noteContent = content.trim();
    if (noteContent.length < 1) throw new Error("Enter a villa note.");
    const currentUser = await this.getCurrentUser();
    const [villa] = await db.select({ id: schema.villas.id }).from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
    if (!villa) throw new Error("Villa not found.");
    await db.insert(schema.notes).values({ scope: "villa", villaId, content: noteContent, authorId: currentUser.id });
  }

  async addCustomerNote(customerId: string, content: string): Promise<void> {
    const noteContent = content.trim();
    if (!noteContent) throw new Error("Enter a customer note.");
    const currentUser = await this.getCurrentUser();
    const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, customerId), isNull(schema.customers.deletedAt)));
    if (!customer) throw new Error("Customer not found.");
    await db.insert(schema.notes).values({ scope: "customer", customerId, content: noteContent, authorId: currentUser.id });
  }

  async cancelVilla(villaId: string, reason: string): Promise<Villa> {
    const cancellationReason = reason.trim();
    if (cancellationReason.length < 3) throw new Error("Enter a cancellation reason.");
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const [villa] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!villa) throw new Error("Villa not found.");

      const [row] = await tx.update(schema.villas).set({
        programmeStatus: "cancelled",
        cancellationReason,
        cancelledAt: new Date(),
        cancelledBy: currentUser.id,
      }).where(eq(schema.villas.id, villaId)).returning();

      await tx.update(schema.reminderRequests).set({ status: "cancelled" }).where(and(eq(schema.reminderRequests.villaId, villaId), inArray(schema.reminderRequests.status, ["awaiting_approval", "ready_to_send"])));
      await tx.insert(schema.notes).values({ scope: "villa", villaId, content: `Villa programme cancelled: ${cancellationReason}`, authorId: currentUser.id });
      await writeAuditLog(tx, { tableName: "villas", recordId: villaId, action: "cancel", before: villa, after: row, reason: cancellationReason, actorId: currentUser.id });

      const [customerLink] = await tx.select().from(schema.villaCustomers).where(and(eq(schema.villaCustomers.villaId, villaId), isNull(schema.villaCustomers.unassignedAt)));
      const [terms] = await tx.select().from(schema.villaInterestTerms).where(eq(schema.villaInterestTerms.villaId, villaId));
      return toVilla({ ...row, customerId: customerLink?.customerId ?? null }, terms);
    });
  }

  async deleteVillaPermanently(villaId: string, reason: string): Promise<void> {
    if (reason.trim().length < 3) throw new Error("Enter a deletion reason.");
    const cancellationReason = reason.trim();
    const currentUser = await this.getCurrentUser();
    return db.transaction(async (tx) => {
      const [villa] = await tx.select().from(schema.villas).where(and(eq(schema.villas.id, villaId), isNull(schema.villas.deletedAt)));
      if (!villa) throw new Error("Villa not found.");
      const [collection] = await tx.select({ id: schema.collections.id }).from(schema.collections).where(eq(schema.collections.villaId, villaId)).limit(1);
      if (collection) throw new Error("This villa has financial history and cannot be permanently deleted.");

      const now = new Date();
      await tx.update(schema.notes).set({ deletedAt: now }).where(eq(schema.notes.villaId, villaId));
      await tx.update(schema.documents).set({ deletedAt: now }).where(eq(schema.documents.villaId, villaId));
      await tx.delete(schema.paymentStages).where(eq(schema.paymentStages.villaId, villaId));
      await tx.update(schema.villaCustomers).set({ unassignedAt: now }).where(and(eq(schema.villaCustomers.villaId, villaId), isNull(schema.villaCustomers.unassignedAt)));
      await tx.update(schema.villas).set({ deletedAt: now }).where(eq(schema.villas.id, villaId));
      await writeAuditLog(tx, { tableName: "villas", recordId: villaId, action: "delete", before: villa, reason: cancellationReason, actorId: currentUser.id });
    });
  }

  async getCollections(query: CollectionQuery = {}): Promise<Collection[]> {
    return fetchCollections(query);
  }

  /**
   * The whole workspace, as of this request.
   *
   * `connection()` marks the caller as request-dependent, forcing dynamic rendering.
   * Without it Next.js sees a page that reads no cookies and no headers, decides it is
   * static, and bakes one build-time snapshot of the database into HTML — every user
   * then sees the same frozen numbers forever, and `router.refresh()` cannot fix it
   * because there is nothing dynamic to re-run. This is invisible in `next dev` (which
   * always renders dynamically) and only appears in a production build.
   *
   * It belongs here rather than as `export const dynamic` on each page: every screen
   * reads live money through this one method, so one guard covers them all and a new
   * page cannot reintroduce the bug by forgetting the export.
   */
  async getDatabase(): Promise<MockDatabase> {
    await connection();
    return assembleDatabase();
  }

  async getNotifications(): Promise<WorkspaceNotification[]> {
    const [database, user] = await Promise.all([assembleDatabase(), this.getCurrentUser()]);
    const visible = notificationsForUser(database.notifications, user, await getWorkspaceToday());
    return withReadState(visible, user.id);
  }

  async markNotificationRead(id: string): Promise<WorkspaceNotification> {
    const currentUser = await this.getCurrentUser();
    const today = await getWorkspaceToday();
    const database = await assembleDatabase();
    const visible = notificationsForUser(database.notifications, currentUser, today);
    const notification = visible.find((candidate) => candidate.id === id);
    if (!notification) throw new Error("Notification not found.");
    await db.insert(schema.notificationReads).values({ userId: currentUser.id, notificationKey: id }).onConflictDoNothing();
    return { ...notification, readBy: [currentUser.id] };
  }

  async markAllNotificationsRead(): Promise<WorkspaceNotification[]> {
    const currentUser = await this.getCurrentUser();
    const today = await getWorkspaceToday();
    const database = await assembleDatabase();
    const visible = notificationsForUser(database.notifications, currentUser, today);
    if (visible.length) {
      await db.insert(schema.notificationReads)
        .values(visible.map((notification) => ({ userId: currentUser.id, notificationKey: notification.id })))
        .onConflictDoNothing();
    }
    return visible.map((notification) => ({ ...notification, readBy: [currentUser.id] }));
  }

  /**
   * The money path. All of it runs inside `record_collection()` in Postgres — see
   * `drizzle/0005_record_collection.sql`.
   *
   * Nothing is computed here. The server function locks the villa row, allocates, charges
   * interest and asserts that allocations plus advance credit equal the amount received
   * before it commits. `calculations.ts` stays a preview for the form only (C8); if the
   * two ever disagree, the stored figure is right and the preview is the bug.
   */
  async recordCollection(input: CollectionInput): Promise<CollectionResult> {
    const currentUser = await this.getCurrentUser();
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

    const [row] = await queryView<{ collectionId: string }>(sql`
      SELECT public.record_collection(
        ${input.villaId}::uuid, ${input.customerId}::uuid, ${input.paymentDate}::date,
        ${String(input.amount)}::numeric, ${input.paymentMethod}::public.payment_method,
        ${input.referenceNumber || null}, ${idempotencyKey}, ${currentUser.id}::uuid,
        ${input.notes ?? null}, ${input.receiptDocumentUrl ?? null}
      ) AS collection_id
    `);

    return this.collectionResult(row.collectionId, input.villaId);
  }

  /** C1/E10 — correct a collection by superseding it. Interest re-derives from the corrected values. */
  async updateCollection(id: string, input: CollectionUpdateInput, reason: string): Promise<CollectionResult> {
    const currentUser = await this.getCurrentUser();

    const [row] = await queryView<{ collectionId: string }>(sql`
      SELECT public.update_collection(
        ${id}::uuid, ${input.villaId}::uuid, ${input.customerId}::uuid,
        ${input.paymentDate}::date, ${String(input.amount)}::numeric,
        ${input.paymentMethod}::public.payment_method, ${input.referenceNumber || null},
        ${currentUser.id}::uuid, ${reason},
        ${input.notes ?? null}, ${input.receiptDocumentUrl ?? null}
      ) AS collection_id
    `);

    return this.collectionResult(row.collectionId, input.villaId);
  }

  /**
   * Reads back what the transaction wrote, through the views — so the shape the caller
   * gets is the same one every other screen reads, with no second definition of "what a
   * collection looks like" to drift out of step.
   */
  private async collectionResult(collectionId: string, villaId: string): Promise<CollectionResult> {
    const collections = await fetchCollections({ villaId });
    const saved = collections.find((candidate) => candidate.id === collectionId);
    if (!saved) throw new Error("The collection was recorded but could not be read back.");

    const [receiptRow] = await queryView<Parameters<typeof toReceipt>[0]>(
      sql`SELECT * FROM v_receipts WHERE collection_id = ${collectionId}::uuid`,
    );
    const scheduleRows = await queryView<Parameters<typeof toPaymentSchedule>[0]>(
      sql`SELECT * FROM v_stage_position WHERE villa_id = ${villaId}::uuid ORDER BY stage_no`,
    );
    const [credit] = await queryView<{ total: string }>(
      sql`SELECT COALESCE(SUM(amount), 0)::text AS total FROM advance_credits WHERE collection_id = ${collectionId}::uuid`,
    );

    return {
      collection: saved,
      receipt: toReceipt(receiptRow),
      schedules: scheduleRows.map(toPaymentSchedule),
      advanceCredit: Number(credit?.total ?? 0),
    };
  }

  /**
   * A user-initiated reminder, from the "Prepare reminder" action on a collection row.
   * `trigger` stays NULL — the once-per-stage guard in `drizzle/0006_reminder_queue.sql`
   * applies only to system-queued rows, so a manual reminder never collides with one the
   * cron job already created for the same stage.
   */
  async createReminderApproval(input: ReminderApprovalInput): Promise<ReminderApproval> {
    if (!input.templateId || !input.subject?.trim() || !input.message?.trim() || !input.attachmentName?.trim()) {
      throw new Error("Select a template, complete the message, and upload an invoice PDF.");
    }
    if (!input.sendDate) throw new Error("Select a proposed send date.");
    const currentUser = await this.getCurrentUser();

    const [row] = await db
      .select({ villa: schema.villas, link: schema.villaCustomers })
      .from(schema.villas)
      .leftJoin(schema.villaCustomers, and(eq(schema.villaCustomers.villaId, schema.villas.id), isNull(schema.villaCustomers.unassignedAt)))
      .where(and(eq(schema.villas.id, input.villaId), isNull(schema.villas.deletedAt)));
    if (!row || row.link?.customerId !== input.customerId || row.villa.programmeStatus === "cancelled") {
      throw new Error("Select an active villa linked to this customer.");
    }

    const [template] = await db.select({ id: schema.reminderTemplates.id }).from(schema.reminderTemplates)
      .where(and(eq(schema.reminderTemplates.id, input.templateId), eq(schema.reminderTemplates.isActive, true), isNull(schema.reminderTemplates.deletedAt)));
    if (!template) throw new Error("Select an active reminder template.");

    const [inserted] = await db.insert(schema.reminderRequests).values({
      villaId: input.villaId,
      customerId: input.customerId,
      templateId: input.templateId,
      origin: "user",
      status: "awaiting_approval",
      sendDate: input.sendDate,
      subject: input.subject.trim(),
      message: input.message.trim(),
      attachmentName: input.attachmentName.trim(),
      attachmentUrl: input.attachmentUrl?.trim() || undefined,
      requestedBy: currentUser.id,
    }).returning();

    return toReminderApproval(inserted);
  }

  async reviewReminderApproval(id: string, input: ReminderApprovalReviewInput): Promise<ReminderApproval> {
    const subject = input.subject?.trim();
    const message = input.message?.trim();
    const attachmentName = input.attachmentName?.trim();
    if (!input.sendDate || !subject || !message || !attachmentName) {
      throw new Error("Complete the reminder details and attach a document.");
    }
    const currentUser = await this.getCurrentUser();

    const [existing] = await db
      .select({ request: schema.reminderRequests, villa: schema.villas, link: schema.villaCustomers })
      .from(schema.reminderRequests)
      .innerJoin(schema.villas, eq(schema.villas.id, schema.reminderRequests.villaId))
      .leftJoin(schema.villaCustomers, and(eq(schema.villaCustomers.villaId, schema.villas.id), isNull(schema.villaCustomers.unassignedAt)))
      .where(eq(schema.reminderRequests.id, id));
    if (!existing) throw new Error("Reminder approval not found.");
    if (existing.link?.customerId !== existing.request.customerId || existing.villa.programmeStatus === "cancelled") {
      throw new Error("This reminder cannot be actioned because its villa programme is inactive.");
    }
    if (existing.request.status === "cancelled" || existing.request.status === "sent") {
      throw new Error("This reminder is no longer available for review.");
    }

    const [row] = await db.update(schema.reminderRequests).set({
      sendDate: input.sendDate,
      subject,
      message,
      attachmentName,
      attachmentUrl: input.attachmentUrl?.trim() || undefined,
      status: input.action === "send" ? "sent" : "ready_to_send",
      reviewedBy: currentUser.id,
      reviewedAt: new Date(),
      ...(input.action === "send" ? { sentAt: new Date(), deliveryStatus: "pending" } : {}),
    }).where(eq(schema.reminderRequests.id, id)).returning();

    if (input.action === "send") {
      await sendReminderEmail(row);
    }

    return toReminderApproval(row);
  }

  async createReminderTemplate(input: ReminderTemplateInput): Promise<ReminderTemplate> {
    validateReminderTemplateInput(input);
    const currentUser = await this.getCurrentUser();
    const [clash] = await db.select({ id: schema.reminderTemplates.id }).from(schema.reminderTemplates).where(and(eq(schema.reminderTemplates.name, input.name.trim()), isNull(schema.reminderTemplates.deletedAt)));
    if (clash) throw new Error("A reminder template with this name already exists.");
    const [row] = await db.insert(schema.reminderTemplates).values({
      name: input.name.trim(),
      type: "custom",
      subject: input.subject.trim(),
      message: input.message.trim(),
      createdBy: currentUser.id,
    }).returning();
    await writeAuditLog(db, { tableName: "reminder_templates", recordId: row.id, action: "create", after: row, actorId: currentUser.id });
    return toReminderTemplate(row);
  }

  async updateReminderTemplate(id: string, input: ReminderTemplateInput): Promise<ReminderTemplate> {
    validateReminderTemplateInput(input);
    const currentUser = await this.getCurrentUser();
    const [existing] = await db.select().from(schema.reminderTemplates).where(and(eq(schema.reminderTemplates.id, id), isNull(schema.reminderTemplates.deletedAt)));
    if (!existing) throw new Error("Reminder template not found.");
    const [clash] = await db.select({ id: schema.reminderTemplates.id }).from(schema.reminderTemplates).where(and(eq(schema.reminderTemplates.name, input.name.trim()), isNull(schema.reminderTemplates.deletedAt)));
    if (clash && clash.id !== id) throw new Error("A reminder template with this name already exists.");
    const [row] = await db.update(schema.reminderTemplates).set({ name: input.name.trim(), subject: input.subject.trim(), message: input.message.trim() }).where(eq(schema.reminderTemplates.id, id)).returning();
    await writeAuditLog(db, { tableName: "reminder_templates", recordId: id, action: "update", before: existing, after: row, actorId: currentUser.id });
    return toReminderTemplate(row);
  }

  async setReminderTemplateActive(id: string, isActive: boolean): Promise<ReminderTemplate> {
    const currentUser = await this.getCurrentUser();
    const [existing] = await db.select().from(schema.reminderTemplates).where(and(eq(schema.reminderTemplates.id, id), isNull(schema.reminderTemplates.deletedAt)));
    if (!existing) throw new Error("Reminder template not found.");
    const [row] = await db.update(schema.reminderTemplates).set({ isActive }).where(eq(schema.reminderTemplates.id, id)).returning();
    await writeAuditLog(db, { tableName: "reminder_templates", recordId: id, action: isActive ? "activate" : "deactivate", before: existing, after: row, actorId: currentUser.id });
    return toReminderTemplate(row);
  }

  async deleteReminderTemplate(id: string): Promise<void> {
    const currentUser = await this.getCurrentUser();
    const [existing] = await db.select().from(schema.reminderTemplates).where(and(eq(schema.reminderTemplates.id, id), isNull(schema.reminderTemplates.deletedAt)));
    if (!existing) throw new Error("Reminder template not found.");
    await db.update(schema.reminderTemplates).set({ deletedAt: new Date() }).where(eq(schema.reminderTemplates.id, id));
    await writeAuditLog(db, { tableName: "reminder_templates", recordId: id, action: "delete", before: existing, actorId: currentUser.id });
  }

  async createGracePeriod(input: GracePeriodInput): Promise<WorkspaceSettings> {
    validateGracePeriodInput(input);
    const currentUser = await this.getCurrentUser();
    const [clash] = await db.select({ id: schema.gracePeriods.id }).from(schema.gracePeriods).where(and(eq(schema.gracePeriods.name, input.name.trim()), isNull(schema.gracePeriods.deletedAt)));
    if (clash) throw new Error("A grace period with this name already exists.");

    return db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.gracePeriods).values({ name: input.name.trim(), days: input.days, description: input.description.trim(), createdBy: currentUser.id }).returning();
      if (input.useAsDefault) await applyGracePeriodDefault(tx, row.id);
      await writeAuditLog(tx, { tableName: "grace_periods", recordId: row.id, action: "create", after: row, actorId: currentUser.id });
      return assembleSettings(tx);
    });
  }

  async updateGracePeriod(id: string, input: GracePeriodInput): Promise<WorkspaceSettings> {
    validateGracePeriodInput(input);
    const currentUser = await this.getCurrentUser();
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.gracePeriods).where(and(eq(schema.gracePeriods.id, id), isNull(schema.gracePeriods.deletedAt)));
      if (!existing) throw new Error("Grace period not found.");
      const [clash] = await tx.select({ id: schema.gracePeriods.id }).from(schema.gracePeriods).where(and(eq(schema.gracePeriods.name, input.name.trim()), isNull(schema.gracePeriods.deletedAt)));
      if (clash && clash.id !== id) throw new Error("A grace period with this name already exists.");
      if (existing.isDefault && !input.useAsDefault) throw new Error("Choose another grace period as the default before removing this default.");

      const [row] = await tx.update(schema.gracePeriods).set({ name: input.name.trim(), days: input.days, description: input.description.trim() }).where(eq(schema.gracePeriods.id, id)).returning();
      if (input.useAsDefault) await applyGracePeriodDefault(tx, id);
      await writeAuditLog(tx, { tableName: "grace_periods", recordId: id, action: "update", before: existing, after: row, actorId: currentUser.id });
      return assembleSettings(tx);
    });
  }

  async setGracePeriodActive(id: string, isActive: boolean): Promise<WorkspaceSettings> {
    const currentUser = await this.getCurrentUser();
    const [existing] = await db.select().from(schema.gracePeriods).where(and(eq(schema.gracePeriods.id, id), isNull(schema.gracePeriods.deletedAt)));
    if (!existing) throw new Error("Grace period not found.");
    if (existing.isDefault && !isActive) throw new Error("Choose another active grace period as the default before disabling this one.");
    await db.update(schema.gracePeriods).set({ isActive }).where(eq(schema.gracePeriods.id, id));
    await writeAuditLog(db, { tableName: "grace_periods", recordId: id, action: isActive ? "activate" : "deactivate", before: existing, actorId: currentUser.id });
    return assembleSettings();
  }

  async deleteGracePeriod(id: string): Promise<WorkspaceSettings> {
    const currentUser = await this.getCurrentUser();
    const [existing] = await db.select().from(schema.gracePeriods).where(and(eq(schema.gracePeriods.id, id), isNull(schema.gracePeriods.deletedAt)));
    if (!existing) throw new Error("Grace period not found.");
    if (existing.isDefault) throw new Error("Choose another grace period as the default before deleting this one.");
    await db.update(schema.gracePeriods).set({ deletedAt: new Date() }).where(eq(schema.gracePeriods.id, id));
    await writeAuditLog(db, { tableName: "grace_periods", recordId: id, action: "delete", before: existing, actorId: currentUser.id });
    return assembleSettings();
  }

  async updateApplicationSettings(input: ApplicationSettingsInput): Promise<WorkspaceSettings> {
    const companyName = input.companyName.trim();
    if (companyName.length < 2) throw new Error("Company name must contain at least two characters.");
    if (!input.dateFormat) throw new Error("Select a date format.");
    const replyToEmail = input.replyToEmail?.trim();
    if (replyToEmail && !/^\S+@\S+\.\S+$/.test(replyToEmail)) throw new Error("Enter a valid reply-to email address.");
    const currentUser = await this.getCurrentUser();
    const [before] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.id, 1));
    const values = { companyName, dateFormat: input.dateFormat, replyToEmail: replyToEmail || null, updatedBy: currentUser.id };
    await db.update(schema.appSettings).set(values).where(eq(schema.appSettings.id, 1));
    await writeAuditLog(db, { tableName: "app_settings", recordId: SINGLETON_AUDIT_RECORD_ID, action: "update", before, after: values, actorId: currentUser.id });
    return assembleSettings();
  }

  async updateInterestDefaults(input: InterestDefaultsInput): Promise<WorkspaceSettings> {
    validateInterestTerms(input.defaultInterestTerms);
    const currentUser = await this.getCurrentUser();
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.interestDefaults).where(eq(schema.interestDefaults.id, 1));
      const values = {
        chargeInterest: input.defaultChargeLatePaymentInterest,
        monthlyRate: String(input.defaultInterestTerms.monthlyRate),
        graceDays: input.defaultInterestTerms.gracePeriodDays,
        prorataDivisor: input.defaultInterestTerms.proRataDivisor,
        interestStart: input.defaultInterestTerms.interestStart,
        allocationOrder: input.defaultInterestTerms.allocationOrder,
        firstReminderDay: input.defaultInterestTerms.reminderDaysAfterDue,
        secondReminderDay: input.defaultInterestTerms.secondReminderDaysAfterDue,
        finalNoticeDay: input.defaultInterestTerms.finalNoticeDaysAfterDue,
        updatedBy: currentUser.id,
      };
      await tx.update(schema.interestDefaults).set(values).where(eq(schema.interestDefaults.id, 1));
      await tx.update(schema.gracePeriods).set({ days: input.defaultInterestTerms.gracePeriodDays }).where(and(eq(schema.gracePeriods.isDefault, true), isNull(schema.gracePeriods.deletedAt)));
      await writeAuditLog(tx, { tableName: "interest_defaults", recordId: SINGLETON_AUDIT_RECORD_ID, action: "update", before, after: values, actorId: currentUser.id });
      return assembleSettings(tx);
    });
  }

  async updateProjectPaymentScheduleDefaults(input: PaymentScheduleDefaultsInput): Promise<WorkspaceSettings> {
    const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(and(eq(schema.projects.id, input.projectId), isNull(schema.projects.deletedAt)));
    if (!project) throw new Error("Select a valid project.");
    if (!input.stages.length) throw new Error("Add at least one payment stage.");
    if (input.stages.some((stage) => !stage.stage.trim() || !Number.isInteger(stage.gracePeriodDays) || stage.gracePeriodDays < 0)) throw new Error("Each payment stage needs a name and valid grace period.");
    const currentUser = await this.getCurrentUser();

    return db.transaction(async (tx) => {
      const before = await tx.select().from(schema.projectScheduleTemplates).where(eq(schema.projectScheduleTemplates.projectId, input.projectId));
      await tx.delete(schema.projectScheduleTemplates).where(eq(schema.projectScheduleTemplates.projectId, input.projectId));
      const after = await tx.insert(schema.projectScheduleTemplates).values(input.stages.map((stage, index) => ({
        projectId: input.projectId,
        stageNo: index + 1,
        stageName: stage.stage.trim(),
        deliverables: stage.deliverables?.trim() || undefined,
        gracePeriodDays: stage.gracePeriodDays,
        createdBy: currentUser.id,
      }))).returning();
      await writeAuditLog(tx, { tableName: "project_schedule_templates", recordId: input.projectId, action: "update", before, after, actorId: currentUser.id });
      return assembleSettings(tx);
    });
  }
}

export function createSupabaseRepository(): Repository {
  return new SupabaseRepository();
}
