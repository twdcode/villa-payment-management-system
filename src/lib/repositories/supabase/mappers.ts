import type {
  Collection,
  CollectionAllocation,
  Customer,
  DocumentLink,
  GracePeriod,
  InterestTerms,
  Note,
  PaymentSchedule,
  Project,
  Receipt,
  ReminderTemplate,
  User,
  Villa,
  VillaOperationalStatus,
} from "@/lib/domain/types";

/**
 * Row -> domain type, one function per shape. Kept separate from the read methods so a
 * column rename only ever touches one line here, not every query that selects it.
 */

/** `date` and `timestamp` columns come back as JS `Date` from `postgres`; the domain
 * types are ISO strings throughout, and every date-arithmetic helper in `lib/finance`
 * assumes that. Converting here means query code never has to remember to do it. */
function toDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toUser(row: { id: string; fullName: string; email: string; role: User["role"]; status: string }): User {
  return { id: row.id, name: row.fullName, email: row.email, role: row.role, isActive: row.status === "active" };
}

export function toProject(row: { id: string; name: string; location: string | null; status: Project["status"]; plannedVillaCount: number | null; createdAt: Date | string }): Project {
  return {
    id: row.id,
    name: row.name,
    location: row.location ?? "",
    status: row.status,
    ...(row.plannedVillaCount != null ? { plannedVillaCount: row.plannedVillaCount } : {}),
    createdAt: toIsoString(row.createdAt),
  };
}

export function toCustomer(row: { id: string; fullName: string; email: string | null; phone: string | null; nicPassport: string | null; address: string | null; createdAt: Date | string }): Customer {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email ?? "",
    phone: row.phone ?? "",
    ...(row.nicPassport ? { nicPassport: row.nicPassport } : {}),
    ...(row.address ? { address: row.address } : {}),
    createdAt: toIsoString(row.createdAt),
  };
}

/**
 * C4: the schema splits `saleStatus` / `programmeStatus`; the frontend still reads a
 * single `operationalStatus` until Phase 5 migrates it. A cancelled programme always
 * wins, whatever the sale status says — a sold-and-then-cancelled villa is "cancelled",
 * not "sold", to the current UI.
 */
export function toOperationalStatus(saleStatus: string, programmeStatus: string): VillaOperationalStatus {
  if (programmeStatus === "cancelled") return "cancelled";
  return saleStatus as VillaOperationalStatus;
}

/**
 * Inverse of `toOperationalStatus`, for writes. The frontend still sends a single
 * `operationalStatus` (Phase 5 has not migrated every call site to the split status yet);
 * "cancelled" maps to the active sale status "available" plus a cancelled programme,
 * since a villa is never sold "as cancelled" — cancellation is layered on top of wherever
 * it sat in the pipeline.
 */
export function fromOperationalStatus(status: VillaOperationalStatus): { saleStatus: "available" | "reserved" | "scheduled" | "sold"; programmeStatus: "active" | "cancelled" } {
  if (status === "cancelled") return { saleStatus: "available", programmeStatus: "cancelled" };
  return { saleStatus: status, programmeStatus: "active" };
}

type VillaRow = {
  id: string;
  projectId: string;
  villaNumber: string;
  villaType: string | null;
  villaValue: string;
  saleStatus: string;
  programmeStatus: string;
  customerId: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | string | null;
  createdAt: Date | string;
};

export function toVilla(row: VillaRow, terms?: VillaTermsRow | null): Villa {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.villaNumber,
    type: row.villaType ?? "",
    value: Number(row.villaValue),
    operationalStatus: toOperationalStatus(row.saleStatus, row.programmeStatus),
    customerId: row.customerId,
    ...(terms ? { chargeLatePaymentInterest: terms.chargeInterest, interestTerms: toInterestTerms(terms) } : {}),
    ...(row.cancellationReason ? { cancellationReason: row.cancellationReason } : {}),
    ...(row.cancelledAt ? { cancelledAt: toIsoString(row.cancelledAt) } : {}),
    createdAt: toIsoString(row.createdAt),
  };
}

type VillaTermsRow = {
  chargeInterest: boolean;
  monthlyRate: string;
  graceDays: number;
  prorataDivisor: number;
  interestStart: InterestTerms["interestStart"];
  allocationOrder: InterestTerms["allocationOrder"];
  firstReminderDay: number;
  secondReminderDay: number;
  finalNoticeDay: number;
};

export function toInterestTerms(row: VillaTermsRow): InterestTerms {
  return {
    monthlyRate: Number(row.monthlyRate),
    gracePeriodDays: row.graceDays,
    proRataDivisor: row.prorataDivisor,
    interestStart: row.interestStart,
    allocationOrder: row.allocationOrder,
    reminderDaysAfterDue: row.firstReminderDay,
    secondReminderDaysAfterDue: row.secondReminderDay,
    finalNoticeDaysAfterDue: row.finalNoticeDay,
  };
}

/** From `v_stage_position` — the view computes accrued interest and status. */
type StagePositionRow = {
  stageId: string;
  villaId: string;
  stageNo: number;
  stageName: string;
  deliverables: string | null;
  dueDate: Date | string | null;
  gracePeriodDays: number;
  principalAmount: string;
  principalPaid: string;
  interestPaid: string;
  interestAccrued: string;
  status: PaymentSchedule["status"];
};

export function toPaymentSchedule(row: StagePositionRow): PaymentSchedule {
  return {
    id: row.stageId,
    villaId: row.villaId,
    stage: row.stageName,
    ...(row.deliverables ? { deliverables: row.deliverables } : {}),
    dueDate: row.dueDate ? toDateString(row.dueDate) : "",
    gracePeriodDays: row.gracePeriodDays,
    principalAmount: Number(row.principalAmount),
    principalPaid: Number(row.principalPaid),
    interestAccrued: Number(row.interestAccrued),
    interestPaid: Number(row.interestPaid),
    status: row.status,
  };
}

type CollectionRow = {
  id: string;
  villaId: string;
  customerId: string;
  paymentDate: Date | string;
  method: Collection["paymentMethod"];
  referenceNo: string | null;
  receiptNo: string;
  receiptDocumentUrl: string | null;
  notes: string | null;
  status: Collection["status"];
  supersedesId: string | null;
  supersededAt: Date | string | null;
  editReason: string | null;
  recordedBy: string;
  createdAt: Date | string;
  projectId: string;
};

export function toCollection(row: CollectionRow, allocations: CollectionAllocation[]): Collection {
  const principalAmount = allocations.reduce((sum, a) => sum + a.principalAmount, 0);
  const interestAmount = allocations.reduce((sum, a) => sum + a.interestAmount, 0);
  return {
    id: row.id,
    receiptId: row.id, // one live collection has exactly one receipt; see v_receipts
    projectId: row.projectId,
    villaId: row.villaId,
    customerId: row.customerId,
    paymentDate: toDateString(row.paymentDate),
    paymentMethod: row.method,
    referenceNumber: row.referenceNo ?? "",
    principalAmount,
    interestAmount,
    totalAmount: principalAmount + interestAmount,
    allocations,
    status: row.status,
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.receiptDocumentUrl ? { receiptDocumentUrl: row.receiptDocumentUrl } : {}),
    ...(row.supersededAt ? { supersededAt: toIsoString(row.supersededAt) } : {}),
    ...(row.supersedesId ? { supersedesId: row.supersedesId } : {}),
    ...(row.editReason ? { editReason: row.editReason } : {}),
    createdBy: row.recordedBy,
    createdAt: toIsoString(row.createdAt),
  };
}

type ReceiptRow = { id: string; number: string; collectionId: string; issuedAt: Date | string; principalAmount: string; interestAmount: string; totalAmount: string };

export function toReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    number: row.number,
    collectionId: row.collectionId,
    issuedAt: toDateString(row.issuedAt),
    principalAmount: Number(row.principalAmount),
    interestAmount: Number(row.interestAmount),
    totalAmount: Number(row.totalAmount),
  };
}

export function toGracePeriod(row: { id: string; name: string; days: number; description: string | null; isDefault: boolean; isActive: boolean }): GracePeriod {
  return { id: row.id, name: row.name, days: row.days, description: row.description ?? "", isDefault: row.isDefault, isActive: row.isActive };
}

export function toReminderTemplate(row: { id: string; type: ReminderTemplate["type"]; name: string; subject: string; message: string; isActive: boolean }): ReminderTemplate {
  return { id: row.id, type: row.type, name: row.name, subject: row.subject, message: row.message, isActive: row.isActive };
}

export function toNote(row: { id: string; scope: "villa" | "customer"; villaId: string | null; customerId: string | null; content: string; authorId: string | null; createdAt: Date | string; updatedAt: Date | string | null }): Note {
  return {
    id: row.id,
    category: row.scope,
    ...(row.villaId ? { villaId: row.villaId } : {}),
    ...(row.customerId ? { customerId: row.customerId } : {}),
    content: row.content,
    authorId: row.authorId ?? "",
    createdAt: toIsoString(row.createdAt),
    ...(row.updatedAt ? { updatedAt: toIsoString(row.updatedAt) } : {}),
  };
}

export function toDocumentLink(row: { id: string; villaId: string; name: string; documentDate: Date | string | null; url: string; addedBy: string | null; createdAt: Date | string }): DocumentLink {
  return {
    id: row.id,
    villaId: row.villaId,
    name: row.name,
    date: row.documentDate ? toDateString(row.documentDate) : toDateString(row.createdAt),
    url: row.url,
    createdBy: row.addedBy ?? "",
    createdAt: toIsoString(row.createdAt),
  };
}
