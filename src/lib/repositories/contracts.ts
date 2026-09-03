import type { Collection, CollectionStatus, Customer, DocumentLink, GracePeriod, InterestTerms, MockDatabase, PaymentMethod, PaymentSchedule, PaymentScheduleDefaultStage, Project, Receipt, ReminderApproval, ReminderTemplate, User, Villa, WorkspaceNotification, WorkspaceSettings } from "@/lib/domain/types";

export type ProjectInput = Pick<Project, "name" | "location" | "status" | "plannedVillaCount">;
export type ProjectUpdate = Partial<ProjectInput>;

export type CustomerInput = Pick<Customer, "fullName" | "email" | "phone" | "nicPassport" | "address">;
export type CustomerUpdate = Partial<CustomerInput>;
export type UserInput = Pick<User, "name" | "email" | "role"> & { temporaryPassword: string };
export type UserUpdate = Pick<User, "name" | "email" | "role"> & { temporaryPassword?: string };

export type PaymentScheduleInput = Pick<PaymentSchedule, "stage" | "deliverables" | "dueDate" | "gracePeriodDays" | "principalAmount">;
export type PaymentScheduleUpdateInput = PaymentScheduleInput & { id?: string };
export type VillaInterestTermsInput = { chargeLatePaymentInterest: boolean; interestTerms: InterestTerms };
export type DocumentLinkInput = Pick<DocumentLink, "name" | "date" | "url">;

export type VillaSetupInput = {
  projectId: string;
  number: string;
  type: string;
  value: number;
  operationalStatus: Villa["operationalStatus"];
  customerId?: string;
  newCustomer?: CustomerInput;
  chargeLatePaymentInterest?: boolean;
  interestTerms?: Partial<InterestTerms>;
  schedules?: PaymentScheduleInput[];
};

export type VillaSetupResult = { villa: Villa; customer: Customer | null; schedules: PaymentSchedule[] };

export type CollectionInput = {
  projectId: string;
  villaId: string;
  customerId: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  amount: number;
  notes?: string;
  receiptDocumentUrl?: string;
};

export type ReminderApprovalInput = Pick<ReminderApproval, "customerId" | "villaId" | "sendDate" | "templateId" | "subject" | "message" | "attachmentName" | "attachmentUrl">;
export type ReminderApprovalReviewInput = Pick<ReminderApproval, "sendDate" | "subject" | "message" | "attachmentName" | "attachmentUrl"> & { action: "draft" | "send" };
export type ReminderTemplateInput = Pick<ReminderTemplate, "name" | "subject" | "message">;
export type ApplicationSettingsInput = Pick<WorkspaceSettings, "companyName" | "dateFormat">;
export type InterestDefaultsInput = Pick<WorkspaceSettings, "defaultChargeLatePaymentInterest" | "defaultInterestTerms">;
export type PaymentScheduleDefaultsInput = { projectId: string; stages: PaymentScheduleDefaultStage[] };
export type GracePeriodInput = Pick<GracePeriod, "name" | "days" | "description"> & { useAsDefault: boolean };

export type CollectionResult = {
  collection: Collection;
  receipt: Receipt;
  schedules: PaymentSchedule[];
  advanceCredit: number;
};

export type VillaQuery = { projectId?: string; customerId?: string; status?: Villa["operationalStatus"] };
export type CollectionQuery = { projectId?: string; villaId?: string; customerId?: string; status?: CollectionStatus };

export interface Repository {
  getCurrentUser(): Promise<User>;
  createUser(input: UserInput): Promise<User>;
  updateUser(id: string, input: UserUpdate): Promise<User>;
  setUserActive(id: string, isActive: boolean): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, input: ProjectUpdate): Promise<Project>;
  getVillas(query?: VillaQuery): Promise<Villa[]>;
  getVilla(id: string): Promise<Villa | null>;
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: string, input: CustomerUpdate): Promise<Customer>;
  completeVillaSetup(input: VillaSetupInput): Promise<VillaSetupResult>;
  getSchedules(villaId?: string): Promise<PaymentSchedule[]>;
  updatePaymentSchedule(villaId: string, schedules: PaymentScheduleUpdateInput[]): Promise<PaymentSchedule[]>;
  updateVillaInterestTerms(villaId: string, input: VillaInterestTermsInput): Promise<Villa>;
  addVillaDocument(villaId: string, input: DocumentLinkInput): Promise<void>;
  addVillaNote(villaId: string, content: string): Promise<void>;
  addCustomerNote(customerId: string, content: string): Promise<void>;
  cancelVilla(villaId: string, reason: string): Promise<Villa>;
  deleteVillaPermanently(villaId: string, reason: string): Promise<void>;
  getCollections(query?: CollectionQuery): Promise<Collection[]>;
  getDatabase(): Promise<MockDatabase>;
  getNotifications(): Promise<WorkspaceNotification[]>;
  markNotificationRead(id: string): Promise<WorkspaceNotification>;
  markAllNotificationsRead(): Promise<WorkspaceNotification[]>;
  recordCollection(input: CollectionInput): Promise<CollectionResult>;
  createReminderApproval(input: ReminderApprovalInput): Promise<ReminderApproval>;
  reviewReminderApproval(id: string, input: ReminderApprovalReviewInput): Promise<ReminderApproval>;
  createReminderTemplate(input: ReminderTemplateInput): Promise<ReminderTemplate>;
  updateReminderTemplate(id: string, input: ReminderTemplateInput): Promise<ReminderTemplate>;
  setReminderTemplateActive(id: string, isActive: boolean): Promise<ReminderTemplate>;
  deleteReminderTemplate(id: string): Promise<void>;
  createGracePeriod(input: GracePeriodInput): Promise<WorkspaceSettings>;
  updateGracePeriod(id: string, input: GracePeriodInput): Promise<WorkspaceSettings>;
  setGracePeriodActive(id: string, isActive: boolean): Promise<WorkspaceSettings>;
  deleteGracePeriod(id: string): Promise<WorkspaceSettings>;
  updateApplicationSettings(input: ApplicationSettingsInput): Promise<WorkspaceSettings>;
  updateInterestDefaults(input: InterestDefaultsInput): Promise<WorkspaceSettings>;
  updateProjectPaymentScheduleDefaults(input: PaymentScheduleDefaultsInput): Promise<WorkspaceSettings>;
  resetDemoData(): Promise<void>;
}
