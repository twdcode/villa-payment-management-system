import { describe, expect, it } from "vitest";

import type { User } from "@/lib/domain/types";
import { seedDatabase } from "@/lib/testing/fixtures";
import { createPaymentRecordedNotification, notificationsForUser, syncNotifications } from "@/lib/notifications/notification-centre";

function databaseWithOneSchedule() {
  const database = structuredClone(seedDatabase);
  database.schedules = [{
    id: "schedule-notification-test",
    villaId: "villa-oc-08",
    stage: "Reservation",
    dueDate: "2026-09-04",
    gracePeriodDays: 30,
    principalAmount: 9_300_000,
    principalPaid: 0,
    interestAccrued: 0,
    interestPaid: 0,
    status: "not_due",
  }];
  database.notifications = [];
  return database;
}

describe("notification centre", () => {
  it("moves a payment through approaching, due, overdue, and final-notice alerts", () => {
    const database = databaseWithOneSchedule();

    expect(syncNotifications(database, "2026-08-28").map((item) => item.type)).toEqual(["payment_approaching"]);
    expect(syncNotifications(database, "2026-09-04").map((item) => item.type)).toEqual(["payment_due"]);
    expect(new Set(syncNotifications(database, "2026-10-05").map((item) => item.type))).toEqual(new Set(["payment_overdue", "final_notice"]));

    database.schedules[0].principalPaid = database.schedules[0].principalAmount;
    expect(syncNotifications(database, "2026-10-05")).toEqual([]);
  });

  it("preserves read state while a schedule notification remains active", () => {
    const database = databaseWithOneSchedule();
    const [notification] = syncNotifications(database, "2026-08-28");
    database.notifications = [{ ...notification, readBy: ["user-vishal"] }];

    expect(syncNotifications(database, "2026-08-29")[0].readBy).toEqual(["user-vishal"]);
  });

  it("expires payment-recorded notifications after seven days", () => {
    const database = databaseWithOneSchedule();
    const collection = seedDatabase.collections[0];
    const receipt = seedDatabase.receipts[0];
    database.notifications = [createPaymentRecordedNotification(database, collection, receipt, "2026-08-28")];

    expect(syncNotifications(database, "2026-09-03").some((item) => item.type === "payment_recorded")).toBe(true);
    expect(syncNotifications(database, "2026-09-04").some((item) => item.type === "payment_recorded")).toBe(false);
  });

  it("delivers notifications only to active Super Admin and Editor users", () => {
    const database = databaseWithOneSchedule();
    const notifications = syncNotifications(database, "2026-08-28");
    // Built here rather than read from `database.users`: that list is attribution only
    // (id + name), and `notificationsForUser` needs the signed-in user's real role.
    const superAdmin: User = { id: "user-vishal", name: "Vishal Silva", email: "vishal@juniper.lk", role: "super_admin", isActive: true };
    const editor: User = { id: "user-niro", name: "Niro Perera", email: "niro@juniper.lk", role: "editor", isActive: true };
    const viewer: User = { id: "user-ima", name: "Ima Fernando", email: "ima@juniper.lk", role: "view_only", isActive: true };

    expect(notificationsForUser(notifications, superAdmin, "2026-08-28")).toHaveLength(1);
    expect(notificationsForUser(notifications, editor, "2026-08-28")).toHaveLength(1);
    expect(notificationsForUser(notifications, viewer, "2026-08-28")).toEqual([]);
  });
});
