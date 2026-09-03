import type { Collection, MockDatabase, NotificationType, PaymentSchedule, Receipt, User, WorkspaceNotification } from "@/lib/domain/types";
import { addDays, isPaymentScheduleReady, principalOutstanding } from "@/lib/finance/calculations";

const RECIPIENT_ROLES = ["super_admin", "editor"] as const;
const SCHEDULE_NOTIFICATION_TYPES = new Set<NotificationType>(["payment_approaching", "payment_due", "payment_overdue", "final_notice"]);

function formatLkr(value: number) {
  return `LKR ${new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function notificationTimestamp(date: string) {
  return `${date}T08:00:00.000Z`;
}

function scheduleNotification(
  database: MockDatabase,
  schedule: PaymentSchedule,
  type: NotificationType,
  createdDate: string,
  expiresAt?: string,
): WorkspaceNotification | null {
  const villa = database.villas.find((candidate) => candidate.id === schedule.villaId);
  if (!villa?.customerId || villa.operationalStatus === "cancelled") return null;
  const project = database.projects.find((candidate) => candidate.id === villa.projectId);
  const customer = database.customers.find((candidate) => candidate.id === villa.customerId);
  if (!project || !customer) return null;

  const amount = formatLkr(principalOutstanding(schedule));
  const villaName = `Villa ${villa.number}`;
  const content: Record<Exclude<NotificationType, "payment_recorded">, { title: string; message: string }> = {
    payment_approaching: {
      title: "Payment approaching",
      message: `${villaName} ${schedule.stage} payment of ${amount} is due on ${formatDate(schedule.dueDate)}.`,
    },
    payment_due: {
      title: "Payment is due",
      message: `${villaName} ${schedule.stage} has ${amount} due from ${customer.fullName}.`,
    },
    payment_overdue: {
      title: "Payment is overdue",
      message: `${villaName} ${schedule.stage} has ${amount} overdue from ${customer.fullName}.`,
    },
    final_notice: {
      title: "Final-notice threshold reached",
      message: `${villaName} ${schedule.stage} requires final-notice follow-up for ${amount}.`,
    },
  };
  if (type === "payment_recorded") return null;

  const dedupeKey = `notification-v1:${type}:${schedule.id}:${schedule.dueDate}`;
  return {
    id: `notification-${dedupeKey}`,
    dedupeKey,
    type,
    ...content[type],
    createdAt: notificationTimestamp(createdDate),
    ...(expiresAt ? { expiresAt } : {}),
    projectId: project.id,
    villaId: villa.id,
    customerId: customer.id,
    scheduleId: schedule.id,
    href: `/projects/${project.id}/villas/${villa.id}`,
    recipientRoles: [...RECIPIENT_ROLES],
    readBy: [],
  };
}

function scheduleCandidates(database: MockDatabase, today: string) {
  const candidates: WorkspaceNotification[] = [];

  for (const schedule of database.schedules) {
    if (!isPaymentScheduleReady(schedule) || principalOutstanding(schedule) <= 0) continue;
    const villa = database.villas.find((candidate) => candidate.id === schedule.villaId);
    if (!villa || villa.operationalStatus === "cancelled") continue;
    const terms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
    const approachingDate = addDays(schedule.dueDate, -7);
    const graceEnd = addDays(schedule.dueDate, schedule.gracePeriodDays);
    const overdueDate = addDays(graceEnd, 1);
    const finalNoticeDate = addDays(schedule.dueDate, terms.finalNoticeDaysAfterDue);

    if (today >= approachingDate && today < schedule.dueDate) {
      const notification = scheduleNotification(database, schedule, "payment_approaching", approachingDate, schedule.dueDate);
      if (notification) candidates.push(notification);
    }
    if (today >= schedule.dueDate && today <= graceEnd) {
      const notification = scheduleNotification(database, schedule, "payment_due", schedule.dueDate, overdueDate);
      if (notification) candidates.push(notification);
    }
    if (today >= overdueDate) {
      const notification = scheduleNotification(database, schedule, "payment_overdue", overdueDate);
      if (notification) candidates.push(notification);
    }
    if (today >= finalNoticeDate) {
      const notification = scheduleNotification(database, schedule, "final_notice", finalNoticeDate);
      if (notification) candidates.push(notification);
    }
  }

  return candidates;
}

export function syncNotifications(database: MockDatabase, today: string) {
  const existing = database.notifications ?? [];
  const existingByKey = new Map(existing.map((notification) => [notification.dedupeKey, notification]));
  const derived = scheduleCandidates(database, today).map((notification) => {
    const saved = existingByKey.get(notification.dedupeKey);
    return saved ? { ...notification, id: saved.id, readBy: saved.readBy } : notification;
  });
  const retainedEvents = existing.filter((notification) =>
    !SCHEDULE_NOTIFICATION_TYPES.has(notification.type) && (!notification.expiresAt || today < notification.expiresAt),
  );

  return [...retainedEvents, ...derived].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createPaymentRecordedNotification(
  database: MockDatabase,
  collection: Collection,
  receipt: Receipt,
  today: string,
): WorkspaceNotification {
  const villa = database.villas.find((candidate) => candidate.id === collection.villaId);
  const customer = database.customers.find((candidate) => candidate.id === collection.customerId);
  const villaName = villa ? `Villa ${villa.number}` : "the selected villa";
  const customerName = customer?.fullName ?? "the customer";
  const dedupeKey = `notification-v1:payment_recorded:${collection.id}`;

  return {
    id: `notification-${dedupeKey}`,
    dedupeKey,
    type: "payment_recorded",
    title: "Payment recorded successfully",
    message: `${receipt.number} recorded ${formatLkr(collection.totalAmount)} from ${customerName} for ${villaName}.`,
    createdAt: `${today}T12:00:00.000Z`,
    expiresAt: addDays(today, 7),
    projectId: collection.projectId,
    villaId: collection.villaId,
    customerId: collection.customerId,
    collectionId: collection.id,
    href: "/collections",
    recipientRoles: [...RECIPIENT_ROLES],
    readBy: [],
  };
}

export function notificationsForUser(notifications: WorkspaceNotification[], user: User, today: string) {
  if (!user.isActive || (user.role !== "super_admin" && user.role !== "editor")) return [];
  return notifications.filter((notification) =>
    notification.recipientRoles.some((role) => role === user.role) && (!notification.expiresAt || today < notification.expiresAt),
  );
}
