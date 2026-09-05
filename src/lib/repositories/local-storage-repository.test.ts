import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalStorageRepository } from "@/lib/repositories/local-storage-repository";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("local storage repository", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a Staff user without persisting the temporary password", async () => {
    const repository = createLocalStorageRepository();
    const user = await repository.createUser({ name: "Nadeesha Perera", email: "finance@juniper.lk", role: "staff", temporaryPassword: "temporary-123" });
    const database = await repository.getDatabase();

    expect(user).toMatchObject({ name: "Nadeesha Perera", role: "staff", isActive: true });
    expect(database.users.find((candidate) => candidate.id === user.id)).not.toHaveProperty("temporaryPassword");
  });

  it("rejects weak passwords and duplicate email addresses", async () => {
    const repository = createLocalStorageRepository();
    await expect(repository.createUser({ name: "Test User", email: "test@juniper.lk", role: "editor", temporaryPassword: "short" })).rejects.toThrow("at least 8 characters");
    await expect(repository.createUser({ name: "Other Vishal", email: "VISHAL@JUNIPER.LK", role: "view_only", temporaryPassword: "temporary-123" })).rejects.toThrow("already exists");
  });

  it("supports disabling, enabling, editing, and deleting another user", async () => {
    const repository = createLocalStorageRepository();
    const disabled = await repository.setUserActive("user-niro", false);
    expect(disabled.isActive).toBe(false);
    expect((await repository.setUserActive("user-niro", true)).isActive).toBe(true);
    expect((await repository.updateUser("user-niro", { name: "Niro Perera", email: "niro@juniper.lk", role: "staff" })).role).toBe("staff");
    await repository.deleteUser("user-niro");
    expect((await repository.getDatabase()).users.some((user) => user.id === "user-niro")).toBe(false);
  });

  it("protects the signed-in user and the final active Super Admin", async () => {
    const repository = createLocalStorageRepository();
    await expect(repository.setUserActive("user-vishal", false)).rejects.toThrow("own account");
    await expect(repository.deleteUser("user-vishal")).rejects.toThrow("own account");
    await expect(repository.updateUser("user-vishal", { name: "Vishal Silva", email: "vishal@juniper.lk", role: "editor" })).rejects.toThrow("another active Super Admin");
  });

  it("creates, edits, disables, and enables reminder templates", async () => {
    const repository = createLocalStorageRepository();
    const created = await repository.createReminderTemplate({
      name: "Seven-day reminder",
      subject: "Payment reminder for {villa_number}",
      message: "Hello {customer_name}, your payment of {amount} is due on {due_date}.",
    });

    expect(created).toMatchObject({ type: "custom", isActive: true });
    expect((await repository.setReminderTemplateActive(created.id, false)).isActive).toBe(false);
    expect((await repository.setReminderTemplateActive(created.id, true)).isActive).toBe(true);

    const updated = await repository.updateReminderTemplate(created.id, {
      name: "Seven-day payment reminder",
      subject: "Upcoming payment for {villa_number}",
      message: "Hello {customer_name}, your payment is due on {due_date}.",
    });
    expect(updated.name).toBe("Seven-day payment reminder");
    expect((await repository.getDatabase()).reminderTemplates.find((template) => template.id === created.id)?.subject).toBe("Upcoming payment for {villa_number}");
  });

  it("rejects duplicate reminder-template names", async () => {
    const repository = createLocalStorageRepository();
    await expect(repository.createReminderTemplate({
      name: "UPCOMING PAYMENT REMINDER",
      subject: "Duplicate",
      message: "Duplicate message",
    })).rejects.toThrow("already exists");
  });

  it("keeps deleted seeded reminder templates deleted after hydration", async () => {
    const repository = createLocalStorageRepository();
    const seededTemplate = (await repository.getDatabase()).reminderTemplates[0];

    await repository.deleteReminderTemplate(seededTemplate.id);

    expect((await repository.getDatabase()).reminderTemplates.some((template) => template.id === seededTemplate.id)).toBe(false);
  });

  it("creates, edits, disables, enables, and deletes a grace period", async () => {
    const repository = createLocalStorageRepository();
    let settings = await repository.createGracePeriod({ name: "Extended settlement", days: 45, description: "For approved payment extensions.", useAsDefault: false });
    const created = settings.gracePeriods.find((period) => period.name === "Extended settlement");

    expect(created).toMatchObject({ days: 45, isActive: true, isDefault: false });
    settings = await repository.setGracePeriodActive(created!.id, false);
    expect(settings.gracePeriods.find((period) => period.id === created!.id)?.isActive).toBe(false);
    settings = await repository.setGracePeriodActive(created!.id, true);
    expect(settings.gracePeriods.find((period) => period.id === created!.id)?.isActive).toBe(true);
    settings = await repository.updateGracePeriod(created!.id, { name: "Extended payment period", days: 60, description: "For approved long-term extensions.", useAsDefault: false });
    expect(settings.gracePeriods.find((period) => period.id === created!.id)?.days).toBe(60);
    settings = await repository.deleteGracePeriod(created!.id);
    expect(settings.gracePeriods.some((period) => period.id === created!.id)).toBe(false);
  });

  it("syncs the selected grace-period default with interest defaults", async () => {
    const repository = createLocalStorageRepository();
    let settings = await repository.createGracePeriod({ name: "Contract extension", days: 21, description: "Short approved extension.", useAsDefault: true });
    const selected = settings.gracePeriods.find((period) => period.name === "Contract extension");

    expect(selected).toMatchObject({ isDefault: true, isActive: true });
    expect(settings.defaultInterestTerms.gracePeriodDays).toBe(21);
    expect(settings.gracePeriods.filter((period) => period.isDefault)).toHaveLength(1);

    settings = await repository.updateInterestDefaults({ defaultChargeLatePaymentInterest: true, defaultInterestTerms: { ...settings.defaultInterestTerms, gracePeriodDays: 18 } });
    expect(settings.gracePeriods.find((period) => period.isDefault)?.days).toBe(18);
  });

  it("protects the active default grace period from disable and delete", async () => {
    const repository = createLocalStorageRepository();
    const defaultPeriod = (await repository.getDatabase()).settings.gracePeriods.find((period) => period.isDefault);

    await expect(repository.setGracePeriodActive(defaultPeriod!.id, false)).rejects.toThrow("another active grace period");
    await expect(repository.deleteGracePeriod(defaultPeriod!.id)).rejects.toThrow("another grace period");
  });

  it("persists notification read state for the signed-in user", async () => {
    const repository = createLocalStorageRepository();
    const notifications = await repository.getNotifications();
    const unread = notifications.find((notification) => !notification.readBy.includes("user-vishal"));

    expect(unread).toBeDefined();
    const updated = await repository.markNotificationRead(unread!.id);
    expect(updated.readBy).toContain("user-vishal");
    expect((await repository.getNotifications()).find((notification) => notification.id === unread!.id)?.readBy).toContain("user-vishal");
  });

  it("creates a seven-day payment-recorded notification with a collection", async () => {
    const repository = createLocalStorageRepository();
    const result = await repository.recordCollection({
      projectId: "project-ocean",
      villaId: "villa-oc-08",
      customerId: "customer-priya",
      paymentDate: "2026-08-28",
      paymentMethod: "bank_transfer",
      referenceNumber: "TEST-RECEIPT-001",
      amount: 100_000,
      receiptDocumentUrl: "https://drive.google.com/example-receipt",
    });
    const notification = (await repository.getNotifications()).find((item) => item.collectionId === result.collection.id);

    expect(notification).toMatchObject({ type: "payment_recorded", expiresAt: "2026-09-04", href: "/collections" });
    expect(result.collection.receiptDocumentUrl).toBe("https://drive.google.com/example-receipt");
  });

  it("creates and edits a project", async () => {
    const repository = createLocalStorageRepository();
    const created = await repository.createProject({ name: "Hilltop Villas", location: "Kandy", status: "active", plannedVillaCount: 10 });
    expect(created).toMatchObject({ name: "Hilltop Villas", location: "Kandy", status: "active" });

    const updated = await repository.updateProject(created.id, { name: "Hilltop Residences", location: "Kandy", status: "completed" });
    expect(updated).toMatchObject({ id: created.id, name: "Hilltop Residences", status: "completed" });

    const database = await repository.getDatabase();
    expect(database.projects.find((project) => project.id === created.id)?.name).toBe("Hilltop Residences");
  });

  it("rejects a project with a blank name", async () => {
    const repository = createLocalStorageRepository();
    await expect(repository.createProject({ name: "  ", location: "Galle", status: "active" })).rejects.toThrow();
  });

  it("creates a customer, rejects a duplicate email, and edits it", async () => {
    const repository = createLocalStorageRepository();
    const created = await repository.createCustomer({ fullName: "Kasun Fernando", email: "kasun@example.com", phone: "+94 77 000 0000" });
    expect(created).toMatchObject({ fullName: "Kasun Fernando", email: "kasun@example.com" });

    await expect(repository.createCustomer({ fullName: "Other", email: "KASUN@EXAMPLE.COM", phone: "+94 77 111 1111" })).rejects.toThrow("already exists");

    const updated = await repository.updateCustomer(created.id, { fullName: "Kasun J. Fernando", email: "kasun@example.com", phone: "+94 77 000 0000" });
    expect(updated.fullName).toBe("Kasun J. Fernando");
  });

  it("finds villas scoped to a project and to a customer", async () => {
    const repository = createLocalStorageRepository();
    const database = await repository.getDatabase();
    const anyVilla = database.villas[0];

    const byProject = await repository.getVillas({ projectId: anyVilla.projectId });
    expect(byProject.every((villa) => villa.projectId === anyVilla.projectId)).toBe(true);
    expect(byProject.some((villa) => villa.id === anyVilla.id)).toBe(true);

    if (anyVilla.customerId) {
      const byCustomer = await repository.getVillas({ customerId: anyVilla.customerId });
      expect(byCustomer.every((villa) => villa.customerId === anyVilla.customerId)).toBe(true);
    }
  });

  it("re-derives interest from corrected values when a collection is edited (E10)", async () => {
    const repository = createLocalStorageRepository();

    // villa-oc-08's first stage is 9,300,000 due 2026-08-28 with no grace period —
    // paying it in full on the due date settles it with zero interest.
    const original = await repository.recordCollection({
      projectId: "project-ocean",
      villaId: "villa-oc-08",
      customerId: "customer-priya",
      paymentDate: "2026-08-28",
      paymentMethod: "bank_transfer",
      referenceNumber: "E10-ORIGINAL",
      amount: 9_300_000,
    });

    const database = await repository.getDatabase();
    const stage = database.schedules.find((schedule) => schedule.villaId === "villa-oc-08" && schedule.stage === "Reservation");
    expect(stage?.principalPaid).toBe(9_300_000);

    // Correction: the real amount was only 5,000,000 — the stage is no longer settled.
    const corrected = await repository.updateCollection(
      original.collection.id,
      {
        projectId: "project-ocean",
        villaId: "villa-oc-08",
        customerId: "customer-priya",
        paymentDate: "2026-08-28",
        paymentMethod: "bank_transfer",
        referenceNumber: "E10-ORIGINAL",
        amount: 5_000_000,
      },
      "Data entry correction",
    );

    const afterEdit = await repository.getDatabase();
    const originalCollection = afterEdit.collections.find((collection) => collection.id === original.collection.id);
    const newStage = afterEdit.schedules.find((schedule) => schedule.villaId === "villa-oc-08" && schedule.stage === "Reservation");

    // Original retained and marked superseded, never deleted.
    expect(originalCollection?.status).toBe("superseded");
    expect(originalCollection?.supersededAt).toBeTruthy();

    // Same receipt number carried to the replacement (C15).
    const originalReceipt = afterEdit.receipts.find((receipt) => receipt.collectionId === original.collection.id);
    const newReceipt = afterEdit.receipts.find((receipt) => receipt.collectionId === corrected.collection.id);
    expect(newReceipt?.number).toBe(originalReceipt?.number);

    // Re-derived from the corrected amount, not carried over from the original.
    expect(newStage?.principalPaid).toBe(5_000_000);
    expect(newStage && newStage.principalAmount - newStage.principalPaid).toBe(4_300_000);
  });

  it("rejects editing a collection without a reason", async () => {
    const repository = createLocalStorageRepository();
    const result = await repository.recordCollection({
      projectId: "project-ocean",
      villaId: "villa-oc-08",
      customerId: "customer-priya",
      paymentDate: "2026-08-28",
      paymentMethod: "cash",
      referenceNumber: "",
      amount: 1_000_000,
    });

    await expect(
      repository.updateCollection(
        result.collection.id,
        { projectId: "project-ocean", villaId: "villa-oc-08", customerId: "customer-priya", paymentDate: "2026-08-28", paymentMethod: "cash", referenceNumber: "", amount: 900_000 },
        "",
      ),
    ).rejects.toThrow("reason");
  });

  it("rejects editing a collection that was already superseded", async () => {
    const repository = createLocalStorageRepository();
    const result = await repository.recordCollection({
      projectId: "project-ocean",
      villaId: "villa-oc-08",
      customerId: "customer-priya",
      paymentDate: "2026-08-28",
      paymentMethod: "cash",
      referenceNumber: "",
      amount: 1_000_000,
    });
    const input = { projectId: "project-ocean", villaId: "villa-oc-08", customerId: "customer-priya", paymentDate: "2026-08-28", paymentMethod: "cash" as const, referenceNumber: "", amount: 900_000 };

    await repository.updateCollection(result.collection.id, input, "First correction");
    await expect(repository.updateCollection(result.collection.id, input, "Second correction")).rejects.toThrow("already been corrected");
  });
});
