import { beforeEach, describe, expect, it } from "vitest";

import { createSupabaseRepository } from "@/lib/repositories/supabase-repository";
import { setCurrentTestUser } from "@/lib/repositories/supabase-repository.integration.setup";
import { seedCustomer, seedProject, seedUser, seedVilla, seedWorkspaceSettings, setWorkspaceToday } from "@/lib/repositories/supabase-repository.integration.fixtures";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Integration tests for SupabaseRepository against a REAL Postgres — run via
 * `npm run test:integration` (scripts/run-integration-tests.sh), never as part of the
 * default `npm test`. These are slow (network round trips per assertion) and require
 * Docker; the unit suite stays fast without them.
 *
 * What's covered here vs. what isn't:
 *   - Every method below is pure `db` — no Supabase Auth, no email. Real SQL runs.
 *   - `createUser` / `setUserActive` / `deleteUser` call the Supabase Admin API
 *     (`createAuthUser` / `deleteAuthUser`), which is mocked in the setup file. Those
 *     tests assert against the mock, not a live account — see the "users" block below.
 *   - `signIn`, `mustChangePassword`, `changePassword`, password reset all go through
 *     Supabase Auth's session cookies directly and are NotImplementedError or throw in
 *     this repository outside a real request; not covered here.
 *   - `reviewReminderApproval`'s call to `sendReminderEmail` is mocked; Phase 7/8 already
 *     covers the send path itself.
 *   - The money path (recordCollection/updateCollection) is covered exhaustively at the
 *     SQL level in drizzle/tests/interest_examples.sql (E1-E7, E10) — the tests here
 *     check that the REPOSITORY method returns the correctly mapped domain shape, not
 *     the interest arithmetic again.
 */
describe("SupabaseRepository — projects", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("creates a project and writes an audit log entry", async () => {
    const repository = createSupabaseRepository();
    const project = await repository.createProject({ name: "  Hilltop Villas  ", location: "Kandy", status: "active", plannedVillaCount: 10 });

    expect(project).toMatchObject({ name: "Hilltop Villas", location: "Kandy", status: "active" });

    const [auditRow] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, project.id));
    expect(auditRow).toMatchObject({ tableName: "projects", action: "create" });
  });

  it("rejects a project with too short a name, before touching the database", async () => {
    const repository = createSupabaseRepository();
    await expect(repository.createProject({ name: "A", location: "Galle", status: "active" })).rejects.toThrow("at least two characters");
  });

  it("updates a project and records before/after in the audit log", async () => {
    const repository = createSupabaseRepository();
    const project = await repository.createProject({ name: "Seaside Villas", location: "Galle", status: "active" });

    const updated = await repository.updateProject(project.id, { status: "completed" });
    expect(updated.status).toBe("completed");
    expect(updated.name).toBe("Seaside Villas");

    const auditRows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, project.id));
    expect(auditRows.some((row) => row.action === "update")).toBe(true);
  });

  it("excludes soft-deleted projects from getProjects and getProject", async () => {
    const repository = createSupabaseRepository();
    const project = await repository.createProject({ name: "Temp Project", location: "Test", status: "active" });

    await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, project.id));

    expect(await repository.getProject(project.id)).toBeNull();
    expect((await repository.getProjects()).some((candidate) => candidate.id === project.id)).toBe(false);
  });

  it("throws when creating a project with no signed-in user", async () => {
    setCurrentTestUser(null);
    const repository = createSupabaseRepository();
    await expect(repository.createProject({ name: "No Session", location: "Test", status: "active" })).rejects.toThrow("Not signed in");
  });
});

describe("SupabaseRepository — customers", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("creates a customer and rejects a duplicate email", async () => {
    const repository = createSupabaseRepository();
    const email = `duplicate-${Date.now()}@example.com`;
    const customer = await repository.createCustomer({ fullName: "Kasun Fernando", email, phone: "+94 77 000 0000" });
    expect(customer.fullName).toBe("Kasun Fernando");

    await expect(repository.createCustomer({ fullName: "Someone Else", email: email.toUpperCase(), phone: "+94 77 111 1111" })).rejects.toThrow("already exists");
  });

  it("updates a customer's details", async () => {
    const repository = createSupabaseRepository();
    const customer = await repository.createCustomer({ fullName: "Priya S", email: `priya-${Date.now()}@example.com`, phone: "+94 77 222 2222" });
    const updated = await repository.updateCustomer(customer.id, { fullName: "Priya Samarawickrama" });
    expect(updated.fullName).toBe("Priya Samarawickrama");
  });
});

describe("SupabaseRepository — villa setup (C7 validation)", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("creates a villa with a new customer and default interest terms", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();

    const result = await repository.completeVillaSetup({
      projectId: project.id,
      number: "T-01",
      type: "Garden 2 Bed",
      value: 20_000_000,
      operationalStatus: "reserved",
      newCustomer: { fullName: "New Customer", email: `new-${Date.now()}@example.com`, phone: "+94 77 333 3333", nicPassport: "", address: "" },
    });

    expect(result.villa).toMatchObject({ number: "T-01", value: 20_000_000, operationalStatus: "reserved" });
    expect(result.villa.customerId).toBeTruthy();
  });

  it("rejects a schedule whose stages do not sum to the villa value", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();

    await expect(
      repository.completeVillaSetup({
        projectId: project.id,
        number: "T-02",
        type: "Garden 2 Bed",
        value: 10_000_000,
        operationalStatus: "reserved",
        customerId: customer.id,
        schedules: [{ stage: "Deposit", deliverables: "", dueDate: "2026-01-01", gracePeriodDays: 0, principalAmount: 5_000_000 }],
      }),
    ).rejects.toThrow("must equal the villa value");
  });

  it("rejects a duplicate villa number within the same project", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();
    await seedVilla(project.id, customer.id, { villaNumber: "T-03" });

    await expect(
      repository.completeVillaSetup({ projectId: project.id, number: "T-03", type: "Garden 2 Bed", value: 5_000_000, operationalStatus: "available" }),
    ).rejects.toThrow("already exists");
  });

  it("rejects specifying both an existing customer and a new one", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();

    await expect(
      repository.completeVillaSetup({
        projectId: project.id,
        number: "T-04",
        type: "Garden 2 Bed",
        value: 5_000_000,
        operationalStatus: "available",
        customerId: customer.id,
        newCustomer: { fullName: "Another", email: "another@example.com", phone: "+94 77 444 4444" },
      }),
    ).rejects.toThrow("not both");
  });
});

describe("SupabaseRepository — villa scoping", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("getVillas filters by projectId", async () => {
    const repository = createSupabaseRepository();
    const projectA = await seedProject();
    const projectB = await seedProject();
    const customer = await seedCustomer();
    const villaA = await seedVilla(projectA.id, customer.id);
    await seedVilla(projectB.id, customer.id);

    const results = await repository.getVillas({ projectId: projectA.id });
    expect(results.some((villa) => villa.id === villaA.id)).toBe(true);
    expect(results.every((villa) => villa.projectId === projectA.id)).toBe(true);
  });

  it("getVilla returns the assigned customer and interest terms", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();
    const villa = await seedVilla(project.id, customer.id, { villaValue: 15_000_000 });

    const result = await repository.getVilla(villa.id);
    expect(result).toMatchObject({ id: villa.id, customerId: customer.id, value: 15_000_000 });
    expect(result?.interestTerms).toMatchObject({ monthlyRate: 0.015, gracePeriodDays: 15 });
  });
});

describe("SupabaseRepository — grace periods and settings", () => {
  beforeEach(async () => {
    await seedWorkspaceSettings();
    setCurrentTestUser(await seedUser());
  });

  it("creates, updates, and deletes a grace period", async () => {
    const repository = createSupabaseRepository();
    let settings = await repository.createGracePeriod({ name: "Extended", days: 45, description: "Test grace period", useAsDefault: false });
    const created = settings.gracePeriods.find((period) => period.name === "Extended");
    expect(created).toMatchObject({ days: 45, isActive: true });

    settings = await repository.updateGracePeriod(created!.id, { name: "Extended v2", days: 60, description: "Updated", useAsDefault: false });
    expect(settings.gracePeriods.find((period) => period.id === created!.id)?.days).toBe(60);

    settings = await repository.deleteGracePeriod(created!.id);
    expect(settings.gracePeriods.some((period) => period.id === created!.id)).toBe(false);
  });

  it("updates application settings including replyToEmail (O7)", async () => {
    const repository = createSupabaseRepository();
    const settings = await repository.updateApplicationSettings({ companyName: "Juniper Test Co", dateFormat: "dd/MM/yyyy", replyToEmail: "reply@juniper-test.lk" });
    expect(settings).toMatchObject({ companyName: "Juniper Test Co", replyToEmail: "reply@juniper-test.lk" });
  });
});

describe("SupabaseRepository — reminder templates", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("creates, edits, and disables a reminder template", async () => {
    const repository = createSupabaseRepository();
    const created = await repository.createReminderTemplate({ type: "custom", name: `Template ${Date.now()}`, subject: "Test subject", message: "Test message" });
    expect(created.isActive).toBe(true);

    const updated = await repository.updateReminderTemplate(created.id, { type: "custom", name: created.name, subject: "Updated subject", message: "Updated message" });
    expect(updated.subject).toBe("Updated subject");

    const disabled = await repository.setReminderTemplateActive(created.id, false);
    expect(disabled.isActive).toBe(false);
  });

  it("blocks a second active template of the same non-custom type", async () => {
    const repository = createSupabaseRepository();
    const suffix = Date.now();
    await repository.createReminderTemplate({ type: "overdue", name: `Overdue A ${suffix}`, subject: "Subject A", message: "Message A" });

    await expect(
      repository.createReminderTemplate({ type: "overdue", name: `Overdue B ${suffix}`, subject: "Subject B", message: "Message B" }),
    ).rejects.toThrow(/already exists/i);
  });

  it("allows more than one active custom template", async () => {
    const repository = createSupabaseRepository();
    const suffix = Date.now();
    await repository.createReminderTemplate({ type: "custom", name: `Custom A ${suffix}`, subject: "Subject A", message: "Message A" });

    await expect(
      repository.createReminderTemplate({ type: "custom", name: `Custom B ${suffix}`, subject: "Subject B", message: "Message B" }),
    ).resolves.toMatchObject({ isActive: true });
  });
});

describe("SupabaseRepository — recordCollection returns the correctly mapped domain shape", () => {
  beforeEach(async () => {
    setCurrentTestUser(await seedUser());
  });

  it("records a payment and returns a Collection with a receipt", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();
    const villa = await seedVilla(project.id, customer.id, { villaValue: 2_000_000 });
    await db.insert(schema.paymentStages).values({ villaId: villa.id, stageNo: 1, stageName: "Stage 1", dueDate: "2026-07-10", principalAmount: "2000000", gracePeriodDays: 15 });
    await setWorkspaceToday("2026-08-28");

    const result = await repository.recordCollection({
      projectId: project.id,
      villaId: villa.id,
      customerId: customer.id,
      paymentDate: "2026-08-28",
      paymentMethod: "cash",
      referenceNumber: "",
      amount: 1_000_000,
      idempotencyKey: `test-${Date.now()}`,
    });

    expect(result.collection).toMatchObject({ villaId: villa.id, customerId: customer.id, paymentMethod: "cash" });
    expect(result.collection.receiptId).toBeTruthy();
    expect(result.receipt).toBeTruthy();
    expect(result.schedules.some((schedule) => schedule.villaId === villa.id)).toBe(true);
  });

  it("returns the SAME collection on a repeated idempotency key rather than double-recording", async () => {
    const repository = createSupabaseRepository();
    const project = await seedProject();
    const customer = await seedCustomer();
    const villa = await seedVilla(project.id, customer.id, { villaValue: 2_000_000 });
    await db.insert(schema.paymentStages).values({ villaId: villa.id, stageNo: 1, stageName: "Stage 1", dueDate: "2026-07-10", principalAmount: "2000000", gracePeriodDays: 15 });
    await setWorkspaceToday("2026-08-28");

    const key = `idempotent-${Date.now()}`;
    const input = { projectId: project.id, villaId: villa.id, customerId: customer.id, paymentDate: "2026-08-28", paymentMethod: "cash" as const, referenceNumber: "", amount: 500_000, idempotencyKey: key };

    const first = await repository.recordCollection(input);
    const second = await repository.recordCollection(input);

    expect(second.collection.id).toBe(first.collection.id);
    const allForVilla = await db.select().from(schema.collections).where(eq(schema.collections.villaId, villa.id));
    expect(allForVilla).toHaveLength(1);
  });
});
