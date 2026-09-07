import { DEFAULT_INTEREST_TERMS } from "@/lib/config/defaults";
import type { Collection, MockDatabase, PaymentSchedule, Receipt, WorkspaceSettings } from "@/lib/domain/types";

/**
 * A fixed "today" for these fixtures' dates to line up against — matches the dates
 * baked into the sample schedules/collections below (e.g. `2026-08-28` due dates).
 * Not the app's real clock; only ever used by tests.
 */
export const FIXTURE_TODAY = "2026-08-28";

const FIXTURE_SETTINGS: WorkspaceSettings = {
  companyName: "Juniper Villa Management",
  currency: "LKR",
  timezone: "Asia/Colombo",
  dateFormat: "dd MMM yyyy",
  receiptPrefix: "JVM-RCP",
  defaultChargeLatePaymentInterest: true,
  defaultInterestTerms: { ...DEFAULT_INTEREST_TERMS },
  gracePeriods: [
    {
      id: "grace-standard",
      name: "Standard grace period",
      days: DEFAULT_INTEREST_TERMS.gracePeriodDays,
      description: "Standard payment extension applied to future villa payment agreements.",
      isDefault: true,
      isActive: true,
    },
  ],
  projectPaymentScheduleDefaults: [],
};

const schedule = (
  id: string,
  villaId: string,
  stage: string,
  dueDate: string,
  principalAmount: number,
  principalPaid: number,
  status: PaymentSchedule["status"],
  interestAccrued = 0,
  interestPaid = 0,
): PaymentSchedule => ({
  id,
  villaId,
  stage,
  dueDate,
  // Follows the workspace default (C9: 15 days) rather than a hardcoded 30, so seeded
  // schedules stay consistent when the default changes.
  gracePeriodDays: DEFAULT_INTEREST_TERMS.gracePeriodDays,
  principalAmount,
  principalPaid,
  interestAccrued,
  interestPaid,
  status,
});

const collection = (
  id: string,
  receiptId: string | null,
  projectId: string,
  villaId: string,
  customerId: string,
  paymentDate: string,
  principalAmount: number,
  interestAmount: number,
  status: Collection["status"],
  scheduleId: string,
): Collection => ({
  id,
  receiptId,
  projectId,
  villaId,
  customerId,
  paymentDate,
  paymentMethod: "bank_transfer",
  referenceNumber: `TXN-${id.slice(-4).toUpperCase()}`,
  principalAmount,
  interestAmount,
  totalAmount: principalAmount + interestAmount,
  allocations: [{ scheduleId, principalAmount, interestAmount }],
  status,
  createdBy: "user-vishal",
  createdAt: `${paymentDate}T10:00:00.000Z`,
});

const receipts: Receipt[] = [
  ["receipt-001", "JVM-RCP-0001", "collection-001", "2025-10-05", 15_000_000, 0],
  ["receipt-002", "JVM-RCP-0002", "collection-002", "2025-12-03", 15_000_000, 0],
  ["receipt-003", "JVM-RCP-0003", "collection-003", "2026-02-08", 15_000_000, 0],
  ["receipt-004", "JVM-RCP-0004", "collection-004", "2026-06-20", 5_000_000, 0],
  ["receipt-005", "JVM-RCP-0005", "collection-006", "2026-08-09", 7_000_000, 0],
  ["receipt-006", "JVM-RCP-0006", "collection-007", "2026-05-17", 17_500_000, 0],
  ["receipt-007", "JVM-RCP-0007", "collection-008", "2026-05-20", 10_500_000, 0],
  ["receipt-008", "JVM-RCP-0008", "collection-009", "2025-05-01", 35_000_000, 0],
  ["receipt-009", "JVM-RCP-0009", "collection-010", "2025-08-01", 34_000_000, 0],
].map(([id, number, collectionId, issuedAt, principalAmount, interestAmount]) => ({
  id: String(id), number: String(number), collectionId: String(collectionId), issuedAt: String(issuedAt), principalAmount: Number(principalAmount), interestAmount: Number(interestAmount), totalAmount: Number(principalAmount) + Number(interestAmount),
}));

export const seedDatabase: MockDatabase = {
  today: FIXTURE_TODAY,
  // Attribution only — `MockDatabase.users` carries no email/role/status. See UserDirectoryEntry.
  users: [
    { id: "user-vishal", name: "Vishal Silva" },
    { id: "user-niro", name: "Niro Perera" },
    { id: "user-ima", name: "Ima Fernando" },
  ],
  projects: [
    { id: "project-ocean", name: "Ocean Crest Residences", location: "Talpe, Galle", status: "active", createdAt: "2025-04-12" },
    { id: "project-palm", name: "Palm Grove Villas", location: "Weligama, Matara", status: "active", createdAt: "2025-08-20" },
    { id: "project-serenity", name: "Serenity Bay Estate", location: "Bentota, Galle", status: "completed", createdAt: "2024-02-15" },
  ],
  customers: [
    { id: "customer-samara", fullName: "Samara Jayasinghe", email: "samara.j@example.com", phone: "+94 77 201 4851", createdAt: "2025-06-01" },
    { id: "customer-nimal", fullName: "Nimal Abeysekera", email: "nimal.a@example.com", phone: "+94 77 314 9270", createdAt: "2025-06-12" },
    { id: "customer-maya", fullName: "Maya Wijeratne", email: "maya.w@example.com", phone: "+94 77 884 3022", createdAt: "2025-09-08" },
    { id: "customer-dineth", fullName: "Dineth Amarasinghe", email: "dineth.a@example.com", phone: "+94 71 527 1188", createdAt: "2025-08-26" },
    { id: "customer-priya", fullName: "Priya Samarawickrama", email: "priya.s@example.com", phone: "+94 77 641 6095", createdAt: "2025-10-14" },
    { id: "customer-tharindu", fullName: "Tharindu Ekanayake", email: "tharindu.e@example.com", phone: "+94 77 309 4550", createdAt: "2026-01-05" },
    { id: "customer-amaya", fullName: "Amaya Gunawardena", email: "amaya.g@example.com", phone: "+94 77 766 1873", createdAt: "2026-01-18" },
    { id: "customer-raveen", fullName: "Raveen De Alwis", email: "raveen.d@example.com", phone: "+94 71 102 7510", createdAt: "2025-05-02" },
    { id: "customer-isha", fullName: "Isha Pathirage", email: "isha.p@example.com", phone: "+94 77 413 2654", createdAt: "2025-07-22" },
    { id: "customer-ken", fullName: "Ken Wimalaratne", email: "ken.w@example.com", phone: "+94 77 214 5931", createdAt: "2026-02-11" },
  ],
  villas: [
    { id: "villa-oc-01", projectId: "project-ocean", number: "OC-01", type: "Beachfront 4 Bed", value: 45_000_000, operationalStatus: "sold", customerId: "customer-samara", createdAt: "2025-04-21" },
    { id: "villa-oc-02", projectId: "project-ocean", number: "OC-02", type: "Beachfront 4 Bed", value: 52_000_000, operationalStatus: "sold", customerId: "customer-nimal", createdAt: "2025-04-21" },
    { id: "villa-oc-03", projectId: "project-ocean", number: "OC-03", type: "Garden 3 Bed", value: 38_000_000, operationalStatus: "scheduled", customerId: "customer-maya", createdAt: "2025-04-21" },
    { id: "villa-oc-04", projectId: "project-ocean", number: "OC-04", type: "Garden 3 Bed", value: 36_000_000, operationalStatus: "available", customerId: null, createdAt: "2025-04-21" },
    { id: "villa-oc-05", projectId: "project-ocean", number: "OC-05", type: "Garden 3 Bed", value: 36_000_000, operationalStatus: "reserved", customerId: null, createdAt: "2025-04-21" },
    { id: "villa-oc-06", projectId: "project-ocean", number: "OC-06", type: "Pool 3 Bed", value: 41_000_000, operationalStatus: "cancelled", customerId: null, createdAt: "2025-04-21" },
    { id: "villa-oc-07", projectId: "project-ocean", number: "OC-07", type: "Pool 3 Bed", value: 42_000_000, operationalStatus: "sold", customerId: "customer-dineth", createdAt: "2025-04-21" },
    { id: "villa-oc-08", projectId: "project-ocean", number: "OC-08", type: "Garden 2 Bed", value: 31_000_000, operationalStatus: "scheduled", customerId: "customer-priya", createdAt: "2025-04-21" },
    { id: "villa-pg-01", projectId: "project-palm", number: "PG-01", type: "Courtyard 3 Bed", value: 35_000_000, operationalStatus: "sold", customerId: "customer-tharindu", createdAt: "2025-09-01" },
    { id: "villa-pg-02", projectId: "project-palm", number: "PG-02", type: "Courtyard 3 Bed", value: 35_000_000, operationalStatus: "sold", customerId: "customer-amaya", createdAt: "2025-09-01" },
    { id: "villa-pg-03", projectId: "project-palm", number: "PG-03", type: "Garden 2 Bed", value: 29_000_000, operationalStatus: "available", customerId: null, createdAt: "2025-09-01" },
    { id: "villa-pg-04", projectId: "project-palm", number: "PG-04", type: "Garden 2 Bed", value: 29_000_000, operationalStatus: "reserved", customerId: null, createdAt: "2025-09-01" },
    { id: "villa-pg-05", projectId: "project-palm", number: "PG-05", type: "Pool 4 Bed", value: 48_000_000, operationalStatus: "scheduled", customerId: "customer-ken", createdAt: "2025-09-01" },
    { id: "villa-pg-06", projectId: "project-palm", number: "PG-06", type: "Pool 4 Bed", value: 48_000_000, operationalStatus: "cancelled", customerId: null, createdAt: "2025-09-01" },
    { id: "villa-sb-01", projectId: "project-serenity", number: "SB-01", type: "Lagoon 3 Bed", value: 35_000_000, operationalStatus: "sold", customerId: "customer-raveen", createdAt: "2024-03-01" },
    { id: "villa-sb-02", projectId: "project-serenity", number: "SB-02", type: "Lagoon 3 Bed", value: 34_000_000, operationalStatus: "sold", customerId: "customer-isha", createdAt: "2024-03-01" },
    { id: "villa-sb-03", projectId: "project-serenity", number: "SB-03", type: "Lagoon 2 Bed", value: 28_000_000, operationalStatus: "sold", customerId: "customer-samara", createdAt: "2024-03-01" },
    { id: "villa-sb-04", projectId: "project-serenity", number: "SB-04", type: "Lagoon 2 Bed", value: 28_000_000, operationalStatus: "available", customerId: null, createdAt: "2024-03-01" },
  ],
  schedules: [
    schedule("schedule-oc-01a", "villa-oc-01", "Reservation", "2025-10-01", 15_000_000, 15_000_000, "paid"),
    schedule("schedule-oc-01b", "villa-oc-01", "Structure complete", "2025-12-01", 15_000_000, 15_000_000, "paid"),
    schedule("schedule-oc-01c", "villa-oc-01", "Handover", "2026-02-01", 15_000_000, 15_000_000, "paid"),
    schedule("schedule-oc-02a", "villa-oc-02", "Reservation", "2026-06-15", 20_000_000, 5_000_000, "overdue", 442_500, 0),
    schedule("schedule-oc-02b", "villa-oc-02", "Structure complete", "2026-10-15", 20_000_000, 0, "not_due"),
    schedule("schedule-oc-02c", "villa-oc-02", "Handover", "2027-02-15", 12_000_000, 0, "not_due"),
    schedule("schedule-oc-03a", "villa-oc-03", "Reservation", "2026-08-15", 12_000_000, 7_000_000, "partially_paid"),
    schedule("schedule-oc-03b", "villa-oc-03", "Structure complete", "2026-11-20", 15_000_000, 0, "not_due"),
    schedule("schedule-oc-03c", "villa-oc-03", "Handover", "2027-03-20", 11_000_000, 0, "not_due"),
    schedule("schedule-oc-07a", "villa-oc-07", "Reservation", "2026-05-15", 17_500_000, 17_500_000, "paid"),
    schedule("schedule-oc-07b", "villa-oc-07", "Structure complete", "2026-09-15", 14_000_000, 0, "not_due"),
    schedule("schedule-oc-07c", "villa-oc-07", "Handover", "2027-01-15", 10_500_000, 0, "not_due"),
    schedule("schedule-oc-08a", "villa-oc-08", "Reservation", "2026-08-28", 9_300_000, 0, "due"),
    schedule("schedule-oc-08b", "villa-oc-08", "Structure complete", "2027-01-28", 12_400_000, 0, "not_due"),
    schedule("schedule-oc-08c", "villa-oc-08", "Handover", "2027-06-28", 9_300_000, 0, "not_due"),
    schedule("schedule-pg-01a", "villa-pg-01", "Reservation", "2026-08-15", 10_500_000, 0, "due"),
    schedule("schedule-pg-01b", "villa-pg-01", "Handover", "2026-12-01", 24_500_000, 0, "not_due"),
    schedule("schedule-pg-02a", "villa-pg-02", "Reservation", "2026-05-20", 10_500_000, 10_500_000, "paid"),
    schedule("schedule-pg-02b", "villa-pg-02", "Handover", "2026-11-20", 24_500_000, 0, "not_due"),
    schedule("schedule-pg-05a", "villa-pg-05", "Reservation", "2026-06-01", 14_400_000, 0, "overdue", 525_600, 0),
    schedule("schedule-pg-05b", "villa-pg-05", "Handover", "2027-01-01", 33_600_000, 0, "not_due"),
    schedule("schedule-sb-01a", "villa-sb-01", "Full settlement", "2025-05-01", 35_000_000, 35_000_000, "paid"),
    schedule("schedule-sb-02a", "villa-sb-02", "Full settlement", "2025-08-01", 34_000_000, 34_000_000, "paid"),
    schedule("schedule-sb-03a", "villa-sb-03", "Full settlement", "2025-10-01", 28_000_000, 28_000_000, "paid"),
  ],
  collections: [
    collection("collection-001", "receipt-001", "project-ocean", "villa-oc-01", "customer-samara", "2025-10-05", 15_000_000, 0, "confirmed", "schedule-oc-01a"),
    collection("collection-002", "receipt-002", "project-ocean", "villa-oc-01", "customer-samara", "2025-12-03", 15_000_000, 0, "confirmed", "schedule-oc-01b"),
    collection("collection-003", "receipt-003", "project-ocean", "villa-oc-01", "customer-samara", "2026-02-08", 15_000_000, 0, "confirmed", "schedule-oc-01c"),
    collection("collection-004", "receipt-004", "project-ocean", "villa-oc-02", "customer-nimal", "2026-06-20", 5_000_000, 0, "confirmed", "schedule-oc-02a"),
    collection("collection-006", "receipt-005", "project-ocean", "villa-oc-03", "customer-maya", "2026-08-09", 7_000_000, 0, "confirmed", "schedule-oc-03a"),
    collection("collection-007", "receipt-006", "project-ocean", "villa-oc-07", "customer-dineth", "2026-05-17", 17_500_000, 0, "confirmed", "schedule-oc-07a"),
    collection("collection-008", "receipt-007", "project-palm", "villa-pg-02", "customer-amaya", "2026-05-20", 10_500_000, 0, "confirmed", "schedule-pg-02a"),
    collection("collection-009", "receipt-008", "project-serenity", "villa-sb-01", "customer-raveen", "2025-05-01", 35_000_000, 0, "confirmed", "schedule-sb-01a"),
    collection("collection-010", "receipt-009", "project-serenity", "villa-sb-02", "customer-isha", "2025-08-01", 34_000_000, 0, "confirmed", "schedule-sb-02a"),
  ],
  receipts,
  advanceCredits: [],
  notes: [
    { id: "note-001", category: "villa", villaId: "villa-oc-02", content: "Customer requested a revised collection forecast after the August reminder.", authorId: "user-niro", createdAt: "2026-08-24T09:30:00.000Z" },
    { id: "note-002", category: "customer", customerId: "customer-maya", content: "Partial payment confirmed against the reservation stage.", authorId: "user-vishal", createdAt: "2026-08-09T10:15:00.000Z" },
  ],
  documents: [
    { id: "document-001", villaId: "villa-oc-01", name: "Signed sale agreement", date: "2025-09-28", url: "https://example.com/juniper/oc-01-sale-agreement", createdBy: "user-vishal", createdAt: "2025-09-28T08:00:00.000Z" },
  ],
  reminderTemplates: [
    { id: "template-upcoming", type: "upcoming", name: "Upcoming payment reminder", subject: "Upcoming payment for {{villa_name}}", message: "Dear {{customer_name}}, your payment of {{outstanding_amount}} is coming due.", isActive: true },
    { id: "template-overdue", type: "overdue", name: "Overdue payment", subject: "Payment overdue for {{villa_name}}", message: "Dear {{customer_name}}, your payment of {{outstanding_amount}} is overdue.", isActive: true },
    { id: "template-received", type: "payment_received", name: "Payment receipt confirmation", subject: "Payment received for {{villa_name}}", message: "Dear {{customer_name}}, we have received your payment for {{villa_name}}.", isActive: true },
    { id: "template-final", type: "final_notice", name: "Final notice", subject: "Final notice for {{villa_name}}", message: "Dear {{customer_name}}, please settle {{outstanding_amount}} immediately.", isActive: true },
  ],
  reminderLogs: [
    { id: "reminder-001", templateId: "template-overdue", scheduleId: "schedule-oc-02a", customerId: "customer-nimal", sentAt: "2026-08-18T09:00:00.000Z", sentBy: "user-niro", deliveryStatus: "sent" },
  ],
  reminderApprovals: [
    { id: "approval-001", customerId: "customer-nimal", villaId: "villa-oc-02", sendDate: "2026-09-02", requestedBy: "user-niro", requestedAt: "2026-08-29T12:00:00.000Z", status: "awaiting_approval" },
    { id: "approval-002", customerId: "customer-maya", villaId: "villa-oc-03", sendDate: "2026-09-02", requestedBy: null, requestedAt: "2026-08-29T12:00:00.000Z", status: "cancelled" },
    { id: "approval-003", customerId: "customer-priya", villaId: "villa-oc-08", sendDate: "2026-09-02", requestedBy: null, requestedAt: "2026-08-29T12:00:00.000Z", status: "ready_to_send" },
    { id: "approval-004", customerId: "customer-ken", villaId: "villa-pg-05", sendDate: "2026-09-02", requestedBy: "user-niro", requestedAt: "2026-08-29T12:00:00.000Z", status: "awaiting_approval" },
    { id: "approval-005", customerId: "customer-dineth", villaId: "villa-oc-07", sendDate: "2026-09-02", requestedBy: "user-niro", requestedAt: "2026-08-29T12:00:00.000Z", status: "sent" },
  ],
  notifications: [],
  settings: FIXTURE_SETTINGS,
};
