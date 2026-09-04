import { DEMO_TODAY } from "@/lib/config/demo";
import type { MockDatabase, PaymentSchedule, PaymentStatus, Villa } from "@/lib/domain/types";
import { addDays, calculateVillaFinancials, daysBetween, isPaymentScheduleReady, paymentStatus, principalOutstanding, roundMoney } from "@/lib/finance/calculations";
import { isVillaActive } from "@/lib/domain/villa-status";

export type DashboardScope = {
  projectId?: string;
  villaId?: string;
};

export type DashboardPaymentStatus = "overdue" | "due" | "due_soon" | "scheduled" | "planned";

export type DashboardPayment = {
  schedule: PaymentSchedule;
  villa: Villa;
  customerName: string;
  projectName: string;
  amount: number;
  daysUntilDue: number;
  status: DashboardPaymentStatus;
};

export type DashboardVillaOutstanding = {
  villa: Villa;
  customerName: string;
  projectName: string;
  outstanding: number;
  overdue: number;
};

export type DashboardCustomerNote = {
  id: string;
  customerId: string;
  customerName: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export type DashboardSnapshot = {
  totalProjectValue: number;
  totalCollected: number;
  outstanding: number;
  futureOutstanding: number;
  currentlyDue: number;
  overdue: number;
  interestOutstanding: number;
  interestCollected: number;
  interestRecoveryRate: number;
  attentionTotal: number;
  overduePaymentCount: number;
  upcomingPaymentCount: number;
  reminderCaseCount: number;
  finalNoticeCount: number;
  payments: DashboardPayment[];
  largestOutstanding: DashboardVillaOutstanding[];
  customerNotes: DashboardCustomerNote[];
  scopedVillaCount: number;
};

function termsForVilla(database: MockDatabase, villa: Villa) {
  const terms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
  return villa.chargeLatePaymentInterest === false ? { ...terms, monthlyRate: 0 } : terms;
}

function scheduleDashboardStatus(schedule: PaymentSchedule, computedStatus: PaymentStatus): DashboardPaymentStatus {
  if (computedStatus === "overdue") return "overdue";
  if (schedule.dueDate <= DEMO_TODAY) return "due";
  if (schedule.dueDate <= addDays(DEMO_TODAY, 7)) return "due_soon";
  if (schedule.dueDate <= addDays(DEMO_TODAY, 60)) return "scheduled";
  return "planned";
}

export function buildDashboardSnapshot(database: MockDatabase, scope: DashboardScope = {}): DashboardSnapshot {
  const scopedVillas = database.villas.filter((villa) =>
    isVillaActive(villa) &&
    (!scope.projectId || scope.projectId === "all" || villa.projectId === scope.projectId) &&
    (!scope.villaId || scope.villaId === "all" || villa.id === scope.villaId),
  );
  const projectNames = new Map(database.projects.map((project) => [project.id, project.name]));
  const customerNames = new Map(database.customers.map((customer) => [customer.id, customer.fullName]));
  const userNames = new Map(database.users.map((user) => [user.id, user.name]));

  let totalProjectValue = 0;
  let totalCollected = 0;
  let outstanding = 0;
  let currentlyDue = 0;
  let overdue = 0;
  let interestOutstanding = 0;
  let interestCollected = 0;
  let reminderCaseCount = 0;
  let finalNoticeCount = 0;
  const payments: DashboardPayment[] = [];
  const largestOutstanding: DashboardVillaOutstanding[] = [];

  for (const villa of scopedVillas) {
    const terms = termsForVilla(database, villa);
    const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id && isPaymentScheduleReady(schedule));
    if (!schedules.length) continue;
    const financials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
    totalProjectValue += financials.totalValue;
    totalCollected += financials.principalCollected;
    outstanding += financials.outstandingPrincipal;
    overdue += financials.overduePrincipal;
    interestOutstanding += financials.interestOutstanding;
    interestCollected += financials.interestCollected;

    for (const schedule of schedules) {
      const amount = principalOutstanding(schedule);
      if (amount <= 0) continue;
      const computedStatus = paymentStatus(schedule, DEMO_TODAY);
      if (schedule.dueDate <= DEMO_TODAY && computedStatus !== "overdue") currentlyDue += amount;
      if (computedStatus === "overdue") {
        const daysAfterDue = daysBetween(schedule.dueDate, DEMO_TODAY);
        if (daysAfterDue >= terms.finalNoticeDaysAfterDue) finalNoticeCount += 1;
        else if (daysAfterDue >= terms.reminderDaysAfterDue) reminderCaseCount += 1;
      }
      payments.push({
        schedule,
        villa,
        customerName: villa.customerId ? customerNames.get(villa.customerId) ?? "Unassigned customer" : "Unassigned customer",
        projectName: projectNames.get(villa.projectId) ?? "Unknown project",
        amount,
        daysUntilDue: schedule.dueDate >= DEMO_TODAY ? daysBetween(DEMO_TODAY, schedule.dueDate) : -daysBetween(schedule.dueDate, DEMO_TODAY),
        status: scheduleDashboardStatus(schedule, computedStatus),
      });
    }

    if (financials.outstandingPrincipal + financials.interestOutstanding > 0) {
      largestOutstanding.push({
        villa,
        customerName: villa.customerId ? customerNames.get(villa.customerId) ?? "Unassigned customer" : "Unassigned customer",
        projectName: projectNames.get(villa.projectId) ?? "Unknown project",
        outstanding: roundMoney(financials.outstandingPrincipal + financials.interestOutstanding),
        overdue: financials.overduePrincipal,
      });
    }
  }

  payments.sort((left, right) => left.schedule.dueDate.localeCompare(right.schedule.dueDate) || left.villa.number.localeCompare(right.villa.number));
  largestOutstanding.sort((left, right) => right.outstanding - left.outstanding);
  const upcomingPaymentCount = payments.filter((payment) => payment.schedule.dueDate > DEMO_TODAY && payment.schedule.dueDate <= addDays(DEMO_TODAY, 60)).length;
  const overduePaymentCount = payments.filter((payment) => payment.status === "overdue").length;
  const futureOutstanding = roundMoney(Math.max(0, outstanding - currentlyDue - overdue));
  const totalInterest = interestCollected + interestOutstanding;
  const scopedCustomerIds = new Set(scopedVillas.flatMap((villa) => villa.customerId ? [villa.customerId] : []));
  const customerNotes = database.notes
    .filter((note) => note.category === "customer" && note.customerId && scopedCustomerIds.has(note.customerId) && !note.deletedAt)
    .map((note) => ({
      id: note.id,
      customerId: note.customerId as string,
      customerName: customerNames.get(note.customerId as string) ?? "Unknown customer",
      authorName: userNames.get(note.authorId) ?? "Juniper user",
      content: note.content,
      createdAt: note.createdAt,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    totalProjectValue: roundMoney(totalProjectValue),
    totalCollected: roundMoney(totalCollected),
    outstanding: roundMoney(outstanding),
    futureOutstanding,
    currentlyDue: roundMoney(currentlyDue),
    overdue: roundMoney(overdue),
    interestOutstanding: roundMoney(interestOutstanding),
    interestCollected: roundMoney(interestCollected),
    interestRecoveryRate: totalInterest > 0 ? roundMoney(interestCollected / totalInterest * 100) : 0,
    attentionTotal: roundMoney(currentlyDue + overdue + interestOutstanding),
    overduePaymentCount,
    upcomingPaymentCount,
    reminderCaseCount,
    finalNoticeCount,
    payments,
    largestOutstanding,
    customerNotes,
    scopedVillaCount: scopedVillas.length,
  };
}
