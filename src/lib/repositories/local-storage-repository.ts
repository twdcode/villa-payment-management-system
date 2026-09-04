import { DEFAULT_INTEREST_TERMS, DEMO_SETTINGS, DEMO_TODAY } from "@/lib/config/demo";
import { allocatePayment, paymentStatus } from "@/lib/finance/calculations";
import { seedDatabase } from "@/lib/mock/seed-data";
import { DATABASE_UPDATED_EVENT } from "@/lib/repositories/events";
import { createPaymentRecordedNotification, notificationsForUser, syncNotifications } from "@/lib/notifications/notification-centre";
import type { Collection, Customer, InterestTerms, MockDatabase, PaymentSchedule, Receipt, ReminderTemplate, User, Villa } from "@/lib/domain/types";
import type { ApplicationSettingsInput, CollectionInput, CollectionQuery, CollectionResult, CustomerInput, GracePeriodInput, InterestDefaultsInput, PaymentScheduleDefaultsInput, PaymentScheduleUpdateInput, ProjectInput, ProjectUpdate, ReminderApprovalReviewInput, ReminderTemplateInput, Repository, UserInput, UserUpdate, VillaQuery, VillaSetupInput, VillaSetupResult } from "@/lib/repositories/contracts";
import { isVillaActive } from "@/lib/domain/villa-status";

const STORAGE_KEY = "juniper-villa-management:mock-database:v1";
const CURRENT_USER_ID = "user-vishal";
export { DATABASE_UPDATED_EVENT };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function hydrateDatabase(database: MockDatabase): MockDatabase {
  const deletedReminderTemplateIds = database.deletedReminderTemplateIds ?? [];
  return {
    ...database,
    settings: {
      ...DEMO_SETTINGS,
      ...database.settings,
      defaultInterestTerms: { ...DEFAULT_INTEREST_TERMS, ...database.settings.defaultInterestTerms },
      gracePeriods: database.settings.gracePeriods?.length ? database.settings.gracePeriods : DEMO_SETTINGS.gracePeriods,
      projectPaymentScheduleDefaults: database.settings.projectPaymentScheduleDefaults ?? DEMO_SETTINGS.projectPaymentScheduleDefaults,
    },
    villas: database.villas.map((villa) => ({
      ...villa,
      ...(villa.interestTerms ? { interestTerms: { ...DEFAULT_INTEREST_TERMS, ...villa.interestTerms } } : {}),
    })),
    reminderTemplates: [...seedDatabase.reminderTemplates.filter((template) => !deletedReminderTemplateIds.includes(template.id) && !database.reminderTemplates.some((existing) => existing.id === template.id)), ...database.reminderTemplates],
    deletedReminderTemplateIds,
    reminderApprovals: database.reminderApprovals ?? [],
    notifications: database.notifications ?? [],
  };
}

function readDatabase(): MockDatabase {
  if (typeof window === "undefined") return clone(seedDatabase);
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const initial = clone(seedDatabase);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  return hydrateDatabase(JSON.parse(saved) as MockDatabase);
}

function writeDatabase(database: MockDatabase) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event(DATABASE_UPDATED_EVENT));
  }
}

function refreshNotifications(database: MockDatabase) {
  const notifications = syncNotifications(database, DEMO_TODAY);
  const changed = JSON.stringify(database.notifications) !== JSON.stringify(notifications);
  database.notifications = notifications;
  if (changed) writeDatabase(database);
  return notifications;
}

function withComputedStatus(schedule: PaymentSchedule) {
  return { ...schedule, status: paymentStatus(schedule, DEMO_TODAY) };
}

function receiptNumber(database: MockDatabase) {
  return `${database.settings.receiptPrefix}-${String(database.receipts.length + 1).padStart(4, "0")}`;
}

function validateProjectInput(input: ProjectInput | ProjectUpdate) {
  if ("name" in input && input.name !== undefined && input.name.trim().length < 2) {
    throw new Error("Project name must contain at least two characters.");
  }
  if ("location" in input && input.location !== undefined && input.location.trim().length < 2) {
    throw new Error("Project location must contain at least two characters.");
  }
  if ("plannedVillaCount" in input && input.plannedVillaCount !== undefined && (!Number.isInteger(input.plannedVillaCount) || input.plannedVillaCount < 1)) {
    throw new Error("Number of villas must be a whole number greater than zero.");
  }
}

function validateCustomerInput(input: CustomerInput) {
  if (input.fullName.trim().length < 2) throw new Error("Customer name must contain at least two characters.");
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Enter a valid customer email address.");
  if (input.phone.trim().length < 7) throw new Error("Enter a valid customer phone number.");
}

function validateUserInput(database: MockDatabase, input: UserInput | UserUpdate, existingId?: string) {
  if (input.name.trim().length < 2) throw new Error("Full name must contain at least two characters.");
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Enter a valid email address.");
  if (database.users.some((user) => user.id !== existingId && user.email.toLocaleLowerCase() === input.email.trim().toLocaleLowerCase())) {
    throw new Error("A user with this email address already exists.");
  }
  if (input.temporaryPassword !== undefined && input.temporaryPassword.length > 0 && input.temporaryPassword.length < 8) {
    throw new Error("Temporary password must contain at least 8 characters.");
  }
}

function validateReminderTemplateInput(database: MockDatabase, input: ReminderTemplateInput, existingId?: string) {
  if (input.name.trim().length < 2) throw new Error("Template name must contain at least two characters.");
  if (!input.subject.trim()) throw new Error("Enter an email subject.");
  if (input.subject.trim().length > 120) throw new Error("Email subject cannot exceed 120 characters.");
  if (!input.message.trim()) throw new Error("Enter a reminder message.");
  if (database.reminderTemplates.some((template) => template.id !== existingId && template.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase())) {
    throw new Error("A reminder template with this name already exists.");
  }
}

function validateGracePeriodInput(database: MockDatabase, input: GracePeriodInput, existingId?: string) {
  if (input.name.trim().length < 2) throw new Error("Grace period name must contain at least two characters.");
  if (!Number.isInteger(input.days) || input.days < 0) throw new Error("Number of days must be a non-negative whole number.");
  if (input.description.trim().length > 300) throw new Error("Description cannot exceed 300 characters.");
  if (database.settings.gracePeriods.some((period) => period.id !== existingId && period.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase())) {
    throw new Error("A grace period with this name already exists.");
  }
}

function withGracePeriodDefault(database: MockDatabase, defaultId: string) {
  const gracePeriods = database.settings.gracePeriods.map((period) => ({ ...period, isDefault: period.id === defaultId, isActive: period.id === defaultId ? true : period.isActive }));
  const selected = gracePeriods.find((period) => period.id === defaultId);
  if (!selected) throw new Error("Grace period not found.");
  database.settings = {
    ...database.settings,
    gracePeriods,
    defaultInterestTerms: { ...database.settings.defaultInterestTerms, gracePeriodDays: selected.days },
  };
}

function isLastActiveSuperAdmin(database: MockDatabase, user: User) {
  return user.isActive && user.role === "super_admin" && database.users.filter((candidate) => candidate.isActive && candidate.role === "super_admin").length === 1;
}

function validateVillaSetup(input: VillaSetupInput, database: MockDatabase) {
  if (!database.projects.some((project) => project.id === input.projectId)) throw new Error("Select a valid project.");
  if (input.number.trim().length < 1) throw new Error("Villa number is required.");
  if (input.type.trim().length < 1) throw new Error("Villa type is required.");
  if (!Number.isFinite(input.value) || input.value <= 0) throw new Error("Villa value must be greater than zero.");
  if (database.villas.some((villa) => villa.projectId === input.projectId && villa.number.trim().toLocaleLowerCase() === input.number.trim().toLocaleLowerCase())) throw new Error("A villa with this number already exists in the selected project.");
  if (input.customerId && !database.customers.some((customer) => customer.id === input.customerId)) throw new Error("Select a valid customer.");
  if (input.newCustomer) validateCustomerInput(input.newCustomer);
  if (input.customerId && input.newCustomer) throw new Error("Choose an existing customer or add a new one, not both.");
  if (input.schedules?.length) {
    const total = input.schedules.reduce((sum, schedule) => sum + schedule.principalAmount, 0);
    if (Math.abs(total - input.value) > 0.01) throw new Error("Payment schedule total must equal the villa value.");
    if (input.schedules.some((schedule) => !schedule.stage.trim() || !schedule.dueDate || schedule.principalAmount <= 0 || schedule.gracePeriodDays < 0)) throw new Error("Complete every payment schedule item before saving.");
  }
}

function createCustomerRecord(input: CustomerInput): Customer {
  return { id: `customer-${crypto.randomUUID()}`, fullName: input.fullName.trim(), email: input.email.trim(), phone: input.phone.trim(), ...(input.nicPassport?.trim() ? { nicPassport: input.nicPassport.trim() } : {}), ...(input.address?.trim() ? { address: input.address.trim() } : {}), createdAt: DEMO_TODAY };
}

function validatePaymentScheduleUpdate(villa: Villa, schedules: PaymentScheduleUpdateInput[], database: MockDatabase) {
  if (!schedules.length) throw new Error("Add at least one payment stage.");
  if (schedules.some((schedule) => !schedule.stage.trim() || schedule.principalAmount < 0 || schedule.gracePeriodDays < 0)) {
    throw new Error("Each stage needs a name, non-negative amount, and valid grace period.");
  }
  const total = schedules.reduce((sum, schedule) => sum + schedule.principalAmount, 0);
  if (total > villa.value) throw new Error("Payment schedule total cannot exceed the villa value.");

  const existing = database.schedules.filter((schedule) => schedule.villaId === villa.id);
  const retainedIds = new Set(schedules.flatMap((schedule) => schedule.id ? [schedule.id] : []));
  for (const schedule of existing) {
    const next = schedules.find((candidate) => candidate.id === schedule.id);
    if (!next && (schedule.principalPaid > 0 || schedule.interestPaid > 0 || database.collections.some((collection) => collection.allocations.some((allocation) => allocation.scheduleId === schedule.id)))) {
      throw new Error(`Cannot remove ${schedule.stage} because it has recorded payments.`);
    }
    if (next && next.principalAmount < schedule.principalPaid) {
      throw new Error(`${schedule.stage} cannot be reduced below its paid amount.`);
    }
  }
  if (retainedIds.size !== schedules.filter((schedule) => schedule.id).length) throw new Error("A payment stage appears more than once.");
}

function validateInterestTerms(terms: InterestTerms) {
  if (terms.monthlyRate < 0 || terms.monthlyRate > 1) throw new Error("Monthly interest rate must be between 0% and 100%.");
  if (!Number.isInteger(terms.gracePeriodDays) || terms.gracePeriodDays < 0) throw new Error("Grace period must be a non-negative whole number.");
  if (!Number.isInteger(terms.proRataDivisor) || terms.proRataDivisor < 1) throw new Error("Pro-rata divisor must be at least one day.");
  if (!Number.isInteger(terms.reminderDaysAfterDue) || !Number.isInteger(terms.secondReminderDaysAfterDue) || !Number.isInteger(terms.finalNoticeDaysAfterDue) || terms.reminderDaysAfterDue < 0 || terms.secondReminderDaysAfterDue < terms.reminderDaysAfterDue || terms.finalNoticeDaysAfterDue < terms.secondReminderDaysAfterDue) {
    throw new Error("Reminder days must be in chronological order.");
  }
}

export function createLocalStorageRepository(): Repository {
  return {
    async getCurrentUser() {
      const user = readDatabase().users.find((candidate) => candidate.id === CURRENT_USER_ID);
      if (!user) throw new Error("Demo user is not configured.");
      return clone(user);
    },
    async createUser(input) {
      const database = readDatabase();
      validateUserInput(database, input);
      if (input.temporaryPassword.length < 8) throw new Error("Temporary password must contain at least 8 characters.");
      const user: User = {
        id: `user-${crypto.randomUUID()}`,
        name: input.name.trim(),
        email: input.email.trim(),
        role: input.role,
        isActive: true,
      };
      database.users.push(user);
      writeDatabase(database);
      return clone(user);
    },
    async updateUser(id, input) {
      const database = readDatabase();
      const index = database.users.findIndex((user) => user.id === id);
      if (index === -1) throw new Error("User not found.");
      validateUserInput(database, input, id);
      const current = database.users[index];
      if (current.role === "super_admin" && input.role !== "super_admin" && isLastActiveSuperAdmin(database, current)) {
        throw new Error("Assign another active Super Admin before changing this role.");
      }
      const updated: User = { ...current, name: input.name.trim(), email: input.email.trim(), role: input.role };
      database.users[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async setUserActive(id, isActive) {
      const database = readDatabase();
      const index = database.users.findIndex((user) => user.id === id);
      if (index === -1) throw new Error("User not found.");
      const current = database.users[index];
      if (!isActive && id === CURRENT_USER_ID) throw new Error("You cannot disable your own account.");
      if (!isActive && isLastActiveSuperAdmin(database, current)) throw new Error("At least one Super Admin must remain active.");
      const updated = { ...current, isActive };
      database.users[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async deleteUser(id) {
      const database = readDatabase();
      const user = database.users.find((candidate) => candidate.id === id);
      if (!user) throw new Error("User not found.");
      if (id === CURRENT_USER_ID) throw new Error("You cannot delete your own account.");
      if (isLastActiveSuperAdmin(database, user)) throw new Error("At least one Super Admin must remain active.");
      database.users = database.users.filter((candidate) => candidate.id !== id);
      writeDatabase(database);
    },
    async getProjects() {
      return clone(readDatabase().projects);
    },
    async getProject(id) {
      return clone(readDatabase().projects.find((project) => project.id === id) ?? null);
    },
    async createProject(input) {
      validateProjectInput(input);
      const database = readDatabase();
      const project = {
        id: `project-${crypto.randomUUID()}`,
        name: input.name.trim(),
        location: input.location.trim(),
        status: input.status,
        ...(input.plannedVillaCount !== undefined ? { plannedVillaCount: input.plannedVillaCount } : {}),
        createdAt: DEMO_TODAY,
      };
      database.projects.unshift(project);
      writeDatabase(database);
      return clone(project);
    },
    async updateProject(id, input) {
      validateProjectInput(input);
      const database = readDatabase();
      const index = database.projects.findIndex((project) => project.id === id);
      if (index === -1) throw new Error("Project not found.");

      const existing = database.projects[index];
      const updated = {
        ...existing,
        ...input,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.location !== undefined ? { location: input.location.trim() } : {}),
      };
      database.projects[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async getVillas(query: VillaQuery = {}) {
      return clone(readDatabase().villas.filter((villa) =>
        (!query.projectId || villa.projectId === query.projectId) &&
        (!query.customerId || villa.customerId === query.customerId) &&
        (!query.status || villa.operationalStatus === query.status),
      ));
    },
    async getVilla(id) {
      return clone(readDatabase().villas.find((villa) => villa.id === id) ?? null);
    },
    async getCustomers() {
      return clone(readDatabase().customers);
    },
    async getCustomer(id) {
      return clone(readDatabase().customers.find((customer) => customer.id === id) ?? null);
    },
    async createCustomer(input) {
      validateCustomerInput(input);
      const database = readDatabase();
      if (database.customers.some((customer) => customer.email.toLocaleLowerCase() === input.email.trim().toLocaleLowerCase())) throw new Error("A customer with this email already exists.");
      const customer = createCustomerRecord(input);
      database.customers.unshift(customer);
      writeDatabase(database);
      return clone(customer);
    },
    async updateCustomer(id, input) {
      const database = readDatabase();
      const index = database.customers.findIndex((customer) => customer.id === id);
      if (index === -1) throw new Error("Customer not found.");
      const next = { ...database.customers[index], ...input, fullName: input.fullName?.trim() ?? database.customers[index].fullName, email: input.email?.trim() ?? database.customers[index].email, phone: input.phone?.trim() ?? database.customers[index].phone, ...(input.nicPassport !== undefined ? { nicPassport: input.nicPassport.trim() || undefined } : {}), ...(input.address !== undefined ? { address: input.address.trim() || undefined } : {}) };
      validateCustomerInput(next);
      if (database.customers.some((customer) => customer.id !== id && customer.email.toLocaleLowerCase() === next.email.toLocaleLowerCase())) throw new Error("A customer with this email already exists.");
      database.customers[index] = next;
      writeDatabase(database);
      return clone(next);
    },
    async completeVillaSetup(input): Promise<VillaSetupResult> {
      const database = readDatabase();
      validateVillaSetup(input, database);
      let customer: Customer | null = null;
      if (input.newCustomer) {
        if (database.customers.some((candidate) => candidate.email.toLocaleLowerCase() === input.newCustomer?.email.trim().toLocaleLowerCase())) throw new Error("A customer with this email already exists.");
        customer = createCustomerRecord(input.newCustomer);
        database.customers.unshift(customer);
      } else if (input.customerId) {
        customer = database.customers.find((candidate) => candidate.id === input.customerId) ?? null;
      }
      const villa: Villa = {
        id: `villa-${crypto.randomUUID()}`,
        projectId: input.projectId,
        number: input.number.trim(),
        type: input.type.trim(),
        value: input.value,
        operationalStatus: input.operationalStatus,
        customerId: customer?.id ?? null,
        ...(input.chargeLatePaymentInterest !== undefined ? { chargeLatePaymentInterest: input.chargeLatePaymentInterest } : {}),
        ...(input.interestTerms ? { interestTerms: input.interestTerms } : {}),
        createdAt: DEMO_TODAY,
      };
      const schedules = (input.schedules ?? []).map((schedule) => ({
        id: `schedule-${crypto.randomUUID()}`,
        villaId: villa.id,
        stage: schedule.stage.trim(),
        ...(schedule.deliverables?.trim() ? { deliverables: schedule.deliverables.trim() } : {}),
        dueDate: schedule.dueDate,
        gracePeriodDays: schedule.gracePeriodDays,
        principalAmount: schedule.principalAmount,
        principalPaid: 0,
        interestAccrued: 0,
        interestPaid: 0,
        status: paymentStatus({ ...schedule, id: "", villaId: villa.id, principalPaid: 0, interestAccrued: 0, interestPaid: 0, status: "not_due" }, DEMO_TODAY),
      }));
      database.villas.unshift(villa);
      database.schedules.unshift(...schedules);
      writeDatabase(database);
      return clone({ villa, customer, schedules });
    },
    async getSchedules(villaId) {
      return clone(readDatabase().schedules.filter((schedule) => !villaId || schedule.villaId === villaId).map(withComputedStatus));
    },
    async updatePaymentSchedule(villaId, schedules) {
      const database = readDatabase();
      const villa = database.villas.find((candidate) => candidate.id === villaId);
      if (!villa) throw new Error("Villa not found.");
      validatePaymentScheduleUpdate(villa, schedules, database);
      const existing = new Map(database.schedules.filter((schedule) => schedule.villaId === villaId).map((schedule) => [schedule.id, schedule]));
      const updated = schedules.map((schedule) => {
        const current = schedule.id ? existing.get(schedule.id) : undefined;
        const next: PaymentSchedule = {
          id: current?.id ?? `schedule-${crypto.randomUUID()}`,
          villaId,
          stage: schedule.stage.trim(),
          ...(schedule.deliverables?.trim() ? { deliverables: schedule.deliverables.trim() } : {}),
          dueDate: schedule.dueDate,
          gracePeriodDays: schedule.gracePeriodDays,
          principalAmount: schedule.principalAmount,
          principalPaid: current?.principalPaid ?? 0,
          interestAccrued: current?.interestAccrued ?? 0,
          interestPaid: current?.interestPaid ?? 0,
          status: "not_due",
        };
        return withComputedStatus(next);
      });
      const retainedIds = new Set(updated.map((schedule) => schedule.id));
      database.schedules = [...database.schedules.filter((schedule) => schedule.villaId !== villaId || retainedIds.has(schedule.id)), ...updated.filter((schedule) => !existing.has(schedule.id))];
      database.schedules = database.schedules.map((schedule) => updated.find((candidate) => candidate.id === schedule.id) ?? schedule);
      writeDatabase(database);
      return clone(updated);
    },
    async updateVillaInterestTerms(villaId, input) {
      validateInterestTerms(input.interestTerms);
      const database = readDatabase();
      const index = database.villas.findIndex((villa) => villa.id === villaId);
      if (index === -1) throw new Error("Villa not found.");
      const updated: Villa = { ...database.villas[index], chargeLatePaymentInterest: input.chargeLatePaymentInterest, interestTerms: input.interestTerms };
      database.villas[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async addVillaDocument(villaId, input) {
      if (!input.name.trim()) throw new Error("Enter a document name.");
      if (!input.date) throw new Error("Select a document date.");
      try { new URL(input.url); } catch { throw new Error("Enter a valid document link."); }
      const database = readDatabase();
      if (!database.villas.some((villa) => villa.id === villaId)) throw new Error("Villa not found.");
      database.documents.unshift({ id: `document-${crypto.randomUUID()}`, villaId, name: input.name.trim(), date: input.date, url: input.url.trim(), createdBy: CURRENT_USER_ID, createdAt: `${DEMO_TODAY}T12:00:00.000Z` });
      writeDatabase(database);
    },
    async addVillaNote(villaId, content) {
      const noteContent = content.trim();
      if (noteContent.length < 1) throw new Error("Enter a villa note.");
      const database = readDatabase();
      if (!database.villas.some((villa) => villa.id === villaId)) throw new Error("Villa not found.");
      database.notes.unshift({ id: `note-${crypto.randomUUID()}`, category: "villa", villaId, content: noteContent, authorId: CURRENT_USER_ID, createdAt: `${DEMO_TODAY}T12:00:00.000Z` });
      writeDatabase(database);
    },
    async addCustomerNote(customerId, content) {
      const noteContent = content.trim();
      if (!noteContent) throw new Error("Enter a customer note.");
      const database = readDatabase();
      if (!database.customers.some((customer) => customer.id === customerId)) throw new Error("Customer not found.");
      database.notes.unshift({ id: `note-${crypto.randomUUID()}`, category: "customer", customerId, content: noteContent, authorId: CURRENT_USER_ID, createdAt: `${DEMO_TODAY}T12:00:00.000Z` });
      writeDatabase(database);
    },
    async cancelVilla(villaId, reason) {
      const cancellationReason = reason.trim();
      if (cancellationReason.length < 3) throw new Error("Enter a cancellation reason.");
      const database = readDatabase();
      const index = database.villas.findIndex((villa) => villa.id === villaId);
      if (index === -1) throw new Error("Villa not found.");
      const updated: Villa = { ...database.villas[index], operationalStatus: "cancelled", cancellationReason, cancelledAt: DEMO_TODAY };
      database.villas[index] = updated;
      database.reminderApprovals = database.reminderApprovals.map((approval) => approval.villaId === villaId && approval.status !== "sent" ? { ...approval, status: "cancelled" } : approval);
      database.notes.unshift({ id: `note-${crypto.randomUUID()}`, category: "villa", villaId, content: `Villa programme cancelled: ${cancellationReason}`, authorId: CURRENT_USER_ID, createdAt: DEMO_TODAY });
      writeDatabase(database);
      return clone(updated);
    },
    async deleteVillaPermanently(villaId, reason) {
      if (reason.trim().length < 3) throw new Error("Enter a deletion reason.");
      const database = readDatabase();
      if (!database.villas.some((villa) => villa.id === villaId)) throw new Error("Villa not found.");
      if (database.collections.some((collection) => collection.villaId === villaId)) throw new Error("This villa has financial history and cannot be permanently deleted.");
      database.villas = database.villas.filter((villa) => villa.id !== villaId);
      database.schedules = database.schedules.filter((schedule) => schedule.villaId !== villaId);
      database.notes = database.notes.filter((note) => note.villaId !== villaId);
      database.documents = database.documents.filter((document) => document.villaId !== villaId);
      writeDatabase(database);
    },
    async getCollections(query: CollectionQuery = {}) {
      const database = readDatabase();
      const activeVillaIds = new Set(database.villas.filter(isVillaActive).map((villa) => villa.id));
      return clone(database.collections.filter((collection) =>
        activeVillaIds.has(collection.villaId) &&
        (!query.projectId || collection.projectId === query.projectId) &&
        (!query.villaId || collection.villaId === query.villaId) &&
        (!query.customerId || collection.customerId === query.customerId) &&
        (!query.status || collection.status === query.status),
      ));
    },
    async getDatabase() {
      const database = readDatabase();
      return clone({ ...database, schedules: database.schedules.map(withComputedStatus) });
    },
    async getNotifications() {
      const database = readDatabase();
      const user = database.users.find((candidate) => candidate.id === CURRENT_USER_ID);
      if (!user) throw new Error("Current user not found.");
      return clone(notificationsForUser(refreshNotifications(database), user, DEMO_TODAY));
    },
    async markNotificationRead(id) {
      const database = readDatabase();
      const user = database.users.find((candidate) => candidate.id === CURRENT_USER_ID);
      if (!user) throw new Error("Current user not found.");
      const visible = notificationsForUser(refreshNotifications(database), user, DEMO_TODAY);
      if (!visible.some((notification) => notification.id === id)) throw new Error("Notification not found.");
      const index = database.notifications.findIndex((notification) => notification.id === id);
      const updated = { ...database.notifications[index], readBy: [...new Set([...database.notifications[index].readBy, user.id])] };
      database.notifications[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async markAllNotificationsRead() {
      const database = readDatabase();
      const user = database.users.find((candidate) => candidate.id === CURRENT_USER_ID);
      if (!user) throw new Error("Current user not found.");
      const visibleIds = new Set(notificationsForUser(refreshNotifications(database), user, DEMO_TODAY).map((notification) => notification.id));
      database.notifications = database.notifications.map((notification) => visibleIds.has(notification.id)
        ? { ...notification, readBy: [...new Set([...notification.readBy, user.id])] }
        : notification);
      writeDatabase(database);
      return clone(notificationsForUser(database.notifications, user, DEMO_TODAY));
    },
    async recordCollection(input: CollectionInput): Promise<CollectionResult> {
      const database = readDatabase();
      const villa = database.villas.find((candidate) => candidate.id === input.villaId);
      const project = database.projects.find((candidate) => candidate.id === input.projectId);
      const customer = database.customers.find((candidate) => candidate.id === input.customerId);
      if (!villa || !project || !customer || villa.projectId !== project.id || villa.customerId !== customer.id) {
        throw new Error("The selected project, villa, and customer do not form a valid collection path.");
      }
      if (villa.operationalStatus === "cancelled") throw new Error("Collections cannot be recorded for a cancelled villa programme.");

      const villaSchedules = database.schedules.filter((schedule) => schedule.villaId === input.villaId);
      const storedTerms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
      const terms = villa.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
      const allocation = allocatePayment(villaSchedules, input.amount, terms, DEMO_TODAY);
      const scheduleIds = new Set(villaSchedules.map((schedule) => schedule.id));
      database.schedules = database.schedules.map((schedule) => allocation.schedules.find((updated) => updated.id === schedule.id) ?? schedule);

      const collectionId = `collection-${crypto.randomUUID()}`;
      const receiptId = `receipt-${crypto.randomUUID()}`;
      const receipt: Receipt = {
        id: receiptId,
        number: receiptNumber(database),
        collectionId,
        issuedAt: input.paymentDate,
        principalAmount: allocation.principalAmount,
        interestAmount: allocation.interestAmount,
        totalAmount: allocation.principalAmount + allocation.interestAmount,
      };
      const newCollection: Collection = {
        id: collectionId,
        receiptId,
        projectId: input.projectId,
        villaId: input.villaId,
        customerId: input.customerId,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        principalAmount: allocation.principalAmount,
        interestAmount: allocation.interestAmount,
        totalAmount: allocation.principalAmount + allocation.interestAmount,
        allocations: allocation.allocations,
        status: "confirmed",
        notes: input.notes,
        ...(input.receiptDocumentUrl ? { receiptDocumentUrl: input.receiptDocumentUrl } : {}),
        createdBy: CURRENT_USER_ID,
        createdAt: `${input.paymentDate}T12:00:00.000Z`,
      };
      if (scheduleIds.size === 0) throw new Error("No payment schedules are available for this villa.");
      database.collections.unshift(newCollection);
      database.receipts.unshift(receipt);
      database.notifications = [...(database.notifications ?? []), createPaymentRecordedNotification(database, newCollection, receipt, DEMO_TODAY)];
      database.notifications = syncNotifications(database, DEMO_TODAY);
      writeDatabase(database);

      return clone({ collection: newCollection, receipt, schedules: allocation.schedules, advanceCredit: allocation.advanceCredit });
    },
    async createReminderApproval(input) {
      if (!input.templateId || !input.subject?.trim() || !input.message?.trim() || !input.attachmentName?.trim()) throw new Error("Select a template, complete the message, and upload an invoice PDF.");
      if (!input.sendDate) throw new Error("Select a proposed send date.");
      const database = readDatabase();
      const villa = database.villas.find((candidate) => candidate.id === input.villaId);
      if (!villa || villa.customerId !== input.customerId || villa.operationalStatus === "cancelled") throw new Error("Select an active villa linked to this customer.");
      if (!database.reminderTemplates.some((template) => template.id === input.templateId && template.isActive)) throw new Error("Select an active reminder template.");
      const approval: import("@/lib/domain/types").ReminderApproval = { id: `approval-${crypto.randomUUID()}`, customerId: input.customerId, villaId: input.villaId, sendDate: input.sendDate, requestedBy: CURRENT_USER_ID, requestedAt: `${DEMO_TODAY}T12:00:00.000Z`, status: "awaiting_approval", templateId: input.templateId, subject: input.subject.trim(), message: input.message.trim(), attachmentName: input.attachmentName.trim(), ...(input.attachmentUrl?.trim() ? { attachmentUrl: input.attachmentUrl.trim() } : {}) };
      database.reminderApprovals.unshift(approval);
      writeDatabase(database);
      return clone(approval);
    },
    async reviewReminderApproval(id: string, input: ReminderApprovalReviewInput) {
      const subject = input.subject?.trim();
      const message = input.message?.trim();
      const attachmentName = input.attachmentName?.trim();
      if (!input.sendDate || !subject || !message || !attachmentName) throw new Error("Complete the reminder details and attach a document.");
      const database = readDatabase();
      const index = database.reminderApprovals.findIndex((approval) => approval.id === id);
      if (index === -1) throw new Error("Reminder approval not found.");
      const approval = database.reminderApprovals[index];
      const villa = database.villas.find((candidate) => candidate.id === approval.villaId);
      const customer = database.customers.find((candidate) => candidate.id === approval.customerId);
      if (!villa || !customer || villa.customerId !== customer.id || villa.operationalStatus === "cancelled") throw new Error("This reminder cannot be actioned because its villa programme is inactive.");
      if (approval.status === "cancelled" || approval.status === "sent") throw new Error("This reminder is no longer available for review.");
      const updated = { ...approval, sendDate: input.sendDate, subject, message, attachmentName, ...(input.attachmentUrl?.trim() ? { attachmentUrl: input.attachmentUrl.trim() } : {}), status: input.action === "send" ? "sent" as const : "ready_to_send" as const };
      database.reminderApprovals[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async createReminderTemplate(input) {
      const database = readDatabase();
      validateReminderTemplateInput(database, input);
      const template: ReminderTemplate = {
        id: `template-${crypto.randomUUID()}`,
        type: "custom",
        name: input.name.trim(),
        subject: input.subject.trim(),
        message: input.message.trim(),
        isActive: true,
      };
      database.reminderTemplates.push(template);
      writeDatabase(database);
      return clone(template);
    },
    async updateReminderTemplate(id, input) {
      const database = readDatabase();
      const index = database.reminderTemplates.findIndex((template) => template.id === id);
      if (index === -1) throw new Error("Reminder template not found.");
      validateReminderTemplateInput(database, input, id);
      const updated: ReminderTemplate = { ...database.reminderTemplates[index], name: input.name.trim(), subject: input.subject.trim(), message: input.message.trim() };
      database.reminderTemplates[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async setReminderTemplateActive(id, isActive) {
      const database = readDatabase();
      const index = database.reminderTemplates.findIndex((template) => template.id === id);
      if (index === -1) throw new Error("Reminder template not found.");
      const updated = { ...database.reminderTemplates[index], isActive };
      database.reminderTemplates[index] = updated;
      writeDatabase(database);
      return clone(updated);
    },
    async deleteReminderTemplate(id) {
      const database = readDatabase();
      if (!database.reminderTemplates.some((template) => template.id === id)) throw new Error("Reminder template not found.");
      database.reminderTemplates = database.reminderTemplates.filter((template) => template.id !== id);
      database.deletedReminderTemplateIds = [...new Set([...(database.deletedReminderTemplateIds ?? []), id])];
      writeDatabase(database);
    },
    async createGracePeriod(input) {
      const database = readDatabase();
      validateGracePeriodInput(database, input);
      const period = {
        id: `grace-${crypto.randomUUID()}`,
        name: input.name.trim(),
        days: input.days,
        description: input.description.trim(),
        isDefault: false,
        isActive: true,
      };
      database.settings = { ...database.settings, gracePeriods: [...database.settings.gracePeriods, period] };
      if (input.useAsDefault) withGracePeriodDefault(database, period.id);
      writeDatabase(database);
      return clone(database.settings);
    },
    async updateGracePeriod(id, input) {
      const database = readDatabase();
      const existing = database.settings.gracePeriods.find((period) => period.id === id);
      if (!existing) throw new Error("Grace period not found.");
      validateGracePeriodInput(database, input, id);
      if (existing.isDefault && !input.useAsDefault) throw new Error("Choose another grace period as the default before removing this default.");
      database.settings = {
        ...database.settings,
        gracePeriods: database.settings.gracePeriods.map((period) => period.id === id ? { ...period, name: input.name.trim(), days: input.days, description: input.description.trim() } : period),
      };
      if (input.useAsDefault) withGracePeriodDefault(database, id);
      writeDatabase(database);
      return clone(database.settings);
    },
    async setGracePeriodActive(id, isActive) {
      const database = readDatabase();
      const existing = database.settings.gracePeriods.find((period) => period.id === id);
      if (!existing) throw new Error("Grace period not found.");
      if (existing.isDefault && !isActive) throw new Error("Choose another active grace period as the default before disabling this one.");
      database.settings = { ...database.settings, gracePeriods: database.settings.gracePeriods.map((period) => period.id === id ? { ...period, isActive } : period) };
      writeDatabase(database);
      return clone(database.settings);
    },
    async deleteGracePeriod(id) {
      const database = readDatabase();
      const existing = database.settings.gracePeriods.find((period) => period.id === id);
      if (!existing) throw new Error("Grace period not found.");
      if (existing.isDefault) throw new Error("Choose another grace period as the default before deleting this one.");
      database.settings = { ...database.settings, gracePeriods: database.settings.gracePeriods.filter((period) => period.id !== id) };
      writeDatabase(database);
      return clone(database.settings);
    },
    async updateApplicationSettings(input: ApplicationSettingsInput) {
      const companyName = input.companyName.trim();
      if (companyName.length < 2) throw new Error("Company name must contain at least two characters.");
      if (!input.dateFormat) throw new Error("Select a date format.");
      const database = readDatabase();
      database.settings = { ...database.settings, companyName, dateFormat: input.dateFormat, currency: "LKR" };
      writeDatabase(database);
      return clone(database.settings);
    },
    async updateInterestDefaults(input: InterestDefaultsInput) {
      validateInterestTerms(input.defaultInterestTerms);
      const database = readDatabase();
      database.settings = {
        ...database.settings,
        defaultChargeLatePaymentInterest: input.defaultChargeLatePaymentInterest,
        defaultInterestTerms: { ...input.defaultInterestTerms },
        gracePeriods: database.settings.gracePeriods.map((period) => period.isDefault ? { ...period, days: input.defaultInterestTerms.gracePeriodDays } : period),
      };
      writeDatabase(database);
      return clone(database.settings);
    },
    async updateProjectPaymentScheduleDefaults(input: PaymentScheduleDefaultsInput) {
      const database = readDatabase();
      if (!database.projects.some((project) => project.id === input.projectId)) throw new Error("Select a valid project.");
      if (!input.stages.length) throw new Error("Add at least one payment stage.");
      if (input.stages.some((stage) => !stage.stage.trim() || !Number.isInteger(stage.gracePeriodDays) || stage.gracePeriodDays < 0)) throw new Error("Each payment stage needs a name and valid grace period.");
      const stages = input.stages.map((stage, index) => ({ id: stage.id || `${input.projectId}-default-stage-${index + 1}`, stage: stage.stage.trim(), ...(stage.deliverables?.trim() ? { deliverables: stage.deliverables.trim() } : {}), gracePeriodDays: stage.gracePeriodDays }));
      const existing = database.settings.projectPaymentScheduleDefaults.filter((item) => item.projectId !== input.projectId);
      database.settings = { ...database.settings, projectPaymentScheduleDefaults: [...existing, { projectId: input.projectId, stages }] };
      writeDatabase(database);
      return clone(database.settings);
    },
    async resetDemoData() {
      writeDatabase(clone(seedDatabase));
    },
  };
}

export const mockRepository = createLocalStorageRepository();
