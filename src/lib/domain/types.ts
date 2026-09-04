export type DateString = string;

export type UserRole = "super_admin" | "editor" | "staff" | "view_only";
export type ProjectStatus = "active" | "completed";
export type VillaOperationalStatus = "available" | "reserved" | "scheduled" | "cancelled" | "sold";
export type PaymentStatus = "not_due" | "due" | "overdue" | "paid" | "partially_paid";
export type CollectionStatus = "confirmed" | "superseded";
export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "card";
export type AllocationOrder = "interest_first" | "principal_first";
export type InterestStart = "after_grace" | "from_due_date";
export type NoteCategory = "villa" | "customer";
export type NotificationType = "payment_approaching" | "payment_due" | "payment_overdue" | "final_notice" | "payment_recorded";
export type NotificationRecipientRole = Extract<UserRole, "super_admin" | "editor">;

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type InterestTerms = {
  monthlyRate: number;
  gracePeriodDays: number;
  proRataDivisor: number;
  interestStart: InterestStart;
  allocationOrder: AllocationOrder;
  reminderDaysAfterDue: number;
  secondReminderDaysAfterDue: number;
  finalNoticeDaysAfterDue: number;
};

export type Project = {
  id: string;
  name: string;
  location: string;
  status: ProjectStatus;
  plannedVillaCount?: number;
  createdAt: DateString;
};

export type Villa = {
  id: string;
  projectId: string;
  number: string;
  type: string;
  value: number;
  operationalStatus: VillaOperationalStatus;
  customerId: string | null;
  chargeLatePaymentInterest?: boolean;
  interestTerms?: Partial<InterestTerms>;
  cancellationReason?: string;
  cancelledAt?: DateString;
  createdAt: DateString;
};

export type Customer = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  nicPassport?: string;
  address?: string;
  createdAt: DateString;
};

export type PaymentSchedule = {
  id: string;
  villaId: string;
  stage: string;
  deliverables?: string;
  dueDate: DateString;
  gracePeriodDays: number;
  principalAmount: number;
  principalPaid: number;
  interestAccrued: number;
  interestPaid: number;
  status: PaymentStatus;
};

export type CollectionAllocation = {
  scheduleId: string;
  principalAmount: number;
  interestAmount: number;
};

export type Collection = {
  id: string;
  receiptId: string | null;
  projectId: string;
  villaId: string;
  customerId: string;
  paymentDate: DateString;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  allocations: CollectionAllocation[];
  status: CollectionStatus;
  notes?: string;
  receiptDocumentUrl?: string;
  supersededAt?: DateString;
  supersedesId?: string;
  editReason?: string;
  createdBy: string;
  createdAt: DateString;
};

export type Receipt = {
  id: string;
  number: string;
  collectionId: string;
  issuedAt: DateString;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
};

export type Note = {
  id: string;
  category: NoteCategory;
  villaId?: string;
  customerId?: string;
  content: string;
  authorId: string;
  createdAt: DateString;
  updatedAt?: DateString;
  deletedAt?: DateString;
};

export type DocumentLink = {
  id: string;
  villaId: string;
  name: string;
  date: DateString;
  url: string;
  createdBy: string;
  createdAt: DateString;
};

export type ReminderTemplate = {
  id: string;
  type: "upcoming" | "overdue" | "payment_received" | "final_notice" | "custom";
  name: string;
  subject: string;
  message: string;
  isActive: boolean;
};

export type ReminderLog = {
  id: string;
  templateId: string;
  scheduleId: string;
  customerId: string;
  sentAt: DateString;
  sentBy: string;
  deliveryStatus: "sent" | "pending" | "failed";
};

export type ReminderApprovalStatus = "awaiting_approval" | "cancelled" | "ready_to_send" | "sent";

export type ReminderApproval = {
  id: string;
  customerId: string;
  villaId: string;
  sendDate: DateString;
  requestedBy: string | null;
  requestedAt: DateString;
  status: ReminderApprovalStatus;
  templateId?: string;
  subject?: string;
  message?: string;
  attachmentName?: string;
  attachmentUrl?: string;
};

export type WorkspaceNotification = {
  id: string;
  dedupeKey: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: DateString;
  expiresAt?: DateString;
  projectId: string;
  villaId: string;
  customerId: string;
  scheduleId?: string;
  collectionId?: string;
  href: string;
  recipientRoles: NotificationRecipientRole[];
  readBy: string[];
};

export type PaymentScheduleDefaultStage = {
  id: string;
  stage: string;
  deliverables?: string;
  gracePeriodDays: number;
};

export type ProjectPaymentScheduleDefault = {
  projectId: string;
  stages: PaymentScheduleDefaultStage[];
};

export type GracePeriod = {
  id: string;
  name: string;
  days: number;
  description: string;
  isDefault: boolean;
  isActive: boolean;
};

export type WorkspaceSettings = {
  companyName: string;
  currency: "LKR";
  timezone: string;
  dateFormat: string;
  receiptPrefix: string;
  defaultChargeLatePaymentInterest: boolean;
  defaultInterestTerms: InterestTerms;
  gracePeriods: GracePeriod[];
  projectPaymentScheduleDefaults: ProjectPaymentScheduleDefault[];
};

export type MockDatabase = {
  users: User[];
  projects: Project[];
  villas: Villa[];
  customers: Customer[];
  schedules: PaymentSchedule[];
  collections: Collection[];
  receipts: Receipt[];
  notes: Note[];
  documents: DocumentLink[];
  reminderTemplates: ReminderTemplate[];
  deletedReminderTemplateIds?: string[];
  reminderLogs: ReminderLog[];
  reminderApprovals: ReminderApproval[];
  notifications: WorkspaceNotification[];
  settings: WorkspaceSettings;
};

export type VillaFinancials = {
  totalValue: number;
  principalCollected: number;
  outstandingPrincipal: number;
  overduePrincipal: number;
  interestAccrued: number;
  interestCollected: number;
  interestOutstanding: number;
};
