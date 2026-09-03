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
    });
    const notification = (await repository.getNotifications()).find((item) => item.collectionId === result.collection.id);

    expect(notification).toMatchObject({ type: "payment_recorded", expiresAt: "2026-09-04", href: "/collections" });
  });
});
