import { describe, expect, it } from "vitest";

import { seedDatabase } from "@/lib/mock/seed-data";
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
    const superAdmin = database.users.find((user) => user.role === "super_admin")!;
    const editor = database.users.find((user) => user.role === "editor")!;
    const viewer = database.users.find((user) => user.role === "view_only")!;

    expect(notificationsForUser(notifications, superAdmin, "2026-08-28")).toHaveLength(1);
    expect(notificationsForUser(notifications, editor, "2026-08-28")).toHaveLength(1);
    expect(notificationsForUser(notifications, viewer, "2026-08-28")).toEqual([]);
  });
});
