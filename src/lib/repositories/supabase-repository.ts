import type { Collection, Customer, MockDatabase, PaymentSchedule, Project, ReminderApproval, ReminderTemplate, User, Villa, WorkspaceNotification, WorkspaceSettings } from "@/lib/domain/types";
import { NotImplementedError } from "@/lib/repositories/errors";

import type { Repository, ApplicationSettingsInput, CollectionInput, CollectionQuery, CollectionResult, CustomerInput, CustomerUpdate, DocumentLinkInput, GracePeriodInput, InterestDefaultsInput, PaymentScheduleDefaultsInput, PaymentScheduleUpdateInput, ProjectInput, ProjectUpdate, ReminderApprovalInput, ReminderApprovalReviewInput, ReminderTemplateInput, UserInput, UserUpdate, VillaInterestTermsInput, VillaQuery, VillaSetupInput, VillaSetupResult } from "./contracts";

/**
 * Supabase-backed implementation of the Repository contract.
 *
 * Every method is a stub until its phase lands. The class exists now so the factory can
 * select an implementation and so any accidental early use fails loudly instead of
 * silently falling back to mock data. Phases 4-6 fill these in.
 */
export class SupabaseRepository implements Repository {
  getCurrentUser(): Promise<User> {
    throw new NotImplementedError("getCurrentUser");
  }

  createUser(_input: UserInput): Promise<User> {
    throw new NotImplementedError("createUser");
  }

  updateUser(_id: string, _input: UserUpdate): Promise<User> {
    throw new NotImplementedError("updateUser");
  }

  setUserActive(_id: string, _isActive: boolean): Promise<User> {
    throw new NotImplementedError("setUserActive");
  }

  deleteUser(_id: string): Promise<void> {
    throw new NotImplementedError("deleteUser");
  }

  getProjects(): Promise<Project[]> {
    throw new NotImplementedError("getProjects");
  }

  getProject(_id: string): Promise<Project | null> {
    throw new NotImplementedError("getProject");
  }

  createProject(_input: ProjectInput): Promise<Project> {
    throw new NotImplementedError("createProject");
  }

  updateProject(_id: string, _input: ProjectUpdate): Promise<Project> {
    throw new NotImplementedError("updateProject");
  }

  getVillas(_query?: VillaQuery): Promise<Villa[]> {
    throw new NotImplementedError("getVillas");
  }

  getVilla(_id: string): Promise<Villa | null> {
    throw new NotImplementedError("getVilla");
  }

  getCustomers(): Promise<Customer[]> {
    throw new NotImplementedError("getCustomers");
  }

  getCustomer(_id: string): Promise<Customer | null> {
    throw new NotImplementedError("getCustomer");
  }

  createCustomer(_input: CustomerInput): Promise<Customer> {
    throw new NotImplementedError("createCustomer");
  }

  updateCustomer(_id: string, _input: CustomerUpdate): Promise<Customer> {
    throw new NotImplementedError("updateCustomer");
  }

  completeVillaSetup(_input: VillaSetupInput): Promise<VillaSetupResult> {
    throw new NotImplementedError("completeVillaSetup");
  }

  getSchedules(_villaId?: string): Promise<PaymentSchedule[]> {
    throw new NotImplementedError("getSchedules");
  }

  updatePaymentSchedule(_villaId: string, _schedules: PaymentScheduleUpdateInput[]): Promise<PaymentSchedule[]> {
    throw new NotImplementedError("updatePaymentSchedule");
  }

  updateVillaInterestTerms(_villaId: string, _input: VillaInterestTermsInput): Promise<Villa> {
    throw new NotImplementedError("updateVillaInterestTerms");
  }

  addVillaDocument(_villaId: string, _input: DocumentLinkInput): Promise<void> {
    throw new NotImplementedError("addVillaDocument");
  }

  addVillaNote(_villaId: string, _content: string): Promise<void> {
    throw new NotImplementedError("addVillaNote");
  }

  addCustomerNote(_customerId: string, _content: string): Promise<void> {
    throw new NotImplementedError("addCustomerNote");
  }

  cancelVilla(_villaId: string, _reason: string): Promise<Villa> {
    throw new NotImplementedError("cancelVilla");
  }

  deleteVillaPermanently(_villaId: string, _reason: string): Promise<void> {
    throw new NotImplementedError("deleteVillaPermanently");
  }

  getCollections(_query?: CollectionQuery): Promise<Collection[]> {
    throw new NotImplementedError("getCollections");
  }

  getDatabase(): Promise<MockDatabase> {
    throw new NotImplementedError("getDatabase");
  }

  getNotifications(): Promise<WorkspaceNotification[]> {
    throw new NotImplementedError("getNotifications");
  }

  markNotificationRead(_id: string): Promise<WorkspaceNotification> {
    throw new NotImplementedError("markNotificationRead");
  }

  markAllNotificationsRead(): Promise<WorkspaceNotification[]> {
    throw new NotImplementedError("markAllNotificationsRead");
  }

  recordCollection(_input: CollectionInput): Promise<CollectionResult> {
    throw new NotImplementedError("recordCollection");
  }

  createReminderApproval(_input: ReminderApprovalInput): Promise<ReminderApproval> {
    throw new NotImplementedError("createReminderApproval");
  }

  reviewReminderApproval(_id: string, _input: ReminderApprovalReviewInput): Promise<ReminderApproval> {
    throw new NotImplementedError("reviewReminderApproval");
  }

  createReminderTemplate(_input: ReminderTemplateInput): Promise<ReminderTemplate> {
    throw new NotImplementedError("createReminderTemplate");
  }

  updateReminderTemplate(_id: string, _input: ReminderTemplateInput): Promise<ReminderTemplate> {
    throw new NotImplementedError("updateReminderTemplate");
  }

  setReminderTemplateActive(_id: string, _isActive: boolean): Promise<ReminderTemplate> {
    throw new NotImplementedError("setReminderTemplateActive");
  }

  deleteReminderTemplate(_id: string): Promise<void> {
    throw new NotImplementedError("deleteReminderTemplate");
  }

  createGracePeriod(_input: GracePeriodInput): Promise<WorkspaceSettings> {
    throw new NotImplementedError("createGracePeriod");
  }

  updateGracePeriod(_id: string, _input: GracePeriodInput): Promise<WorkspaceSettings> {
    throw new NotImplementedError("updateGracePeriod");
  }

  setGracePeriodActive(_id: string, _isActive: boolean): Promise<WorkspaceSettings> {
    throw new NotImplementedError("setGracePeriodActive");
  }

  deleteGracePeriod(_id: string): Promise<WorkspaceSettings> {
    throw new NotImplementedError("deleteGracePeriod");
  }

  updateApplicationSettings(_input: ApplicationSettingsInput): Promise<WorkspaceSettings> {
    throw new NotImplementedError("updateApplicationSettings");
  }

  updateInterestDefaults(_input: InterestDefaultsInput): Promise<WorkspaceSettings> {
    throw new NotImplementedError("updateInterestDefaults");
  }

  updateProjectPaymentScheduleDefaults(_input: PaymentScheduleDefaultsInput): Promise<WorkspaceSettings> {
    throw new NotImplementedError("updateProjectPaymentScheduleDefaults");
  }

  resetDemoData(): Promise<void> {
    throw new NotImplementedError("resetDemoData");
  }
}

export function createSupabaseRepository(): Repository {
  return new SupabaseRepository();
}
