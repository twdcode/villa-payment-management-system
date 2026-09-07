"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock3, Plus, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/ui/toast";
import { CollectionRowActions } from "@/components/collections/collection-row-actions";
import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { ReminderReviewDialog } from "@/components/collections/reminder-review-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MockDatabase, ReminderApproval, ReminderApprovalStatus } from "@/lib/domain/types";
import { collectionRowStatusLabels } from "@/lib/domain/status-labels";
import { buildCollectionRows, type CollectionRow, type CollectionRowStatus } from "@/lib/domain/collection-rows";
import { addDays, calculateVillaFinancials, isPaymentScheduleReady, paymentStatus, principalOutstanding } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { isVillaActive } from "@/lib/domain/villa-status";
import { useCurrentUser } from "@/components/auth/current-user-provider";


type View = "all" | "reminders";

const approvalLabels: Record<ReminderApprovalStatus, string> = { awaiting_approval: "Awaiting approval", cancelled: "Cancelled", ready_to_send: "Ready to send", sent: "Sent" };
const approvalClasses: Record<ReminderApprovalStatus, string> = { awaiting_approval: "bg-warning/15 text-warning", cancelled: "bg-danger/10 text-danger", ready_to_send: "bg-surface-muted text-primary", sent: "bg-success/10 text-success" };
const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

function SelectControl({ children, onChange, value }: { children: React.ReactNode; onChange: (value: string) => void; value: string }) {
  return <label className="relative block"><Select onValueChange={onChange} value={value}><SelectTrigger className="h-12 px-4 text-sm font-semibold"><SelectValue /></SelectTrigger><SelectContent>{children}</SelectContent></Select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /></label>;
}

const rowStatusClasses: Record<CollectionRowStatus, string> = {
  not_due: "bg-info/10 text-info",
  due_soon: "bg-warning/15 text-warning",
  due: "bg-warning/15 text-warning",
  overdue: "bg-danger/10 text-danger",
  partially_paid: "bg-success/10 text-success",
  paid: "bg-success/10 text-success",
  confirmed: "bg-success/10 text-success",
  superseded: "bg-surface-muted text-muted-foreground",
};

function CollectionTable({ database, rows }: { database: MockDatabase; rows: CollectionRow[] }) {
  const customers = new Map(database.customers.map((customer) => [customer.id, customer]));
  const villas = new Map(database.villas.map((villa) => [villa.id, villa]));
  const projects = new Map(database.projects.map((project) => [project.id, project]));
  const receipts = new Map(database.receipts.map((receipt) => [receipt.collectionId, receipt]));

  return <div className="overflow-x-auto rounded-lg border bg-surface"><table className="min-w-[75rem] w-full text-left text-sm"><thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-4">Due date</th><th className="px-5 py-4">Receipt</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Villa</th><th className="px-5 py-4">Method</th><th className="px-5 py-4">Principal (LKR)</th><th className="px-5 py-4">Interest (LKR)</th><th className="px-5 py-4">Total (LKR)</th><th className="px-5 py-4">Status</th><th className="sticky right-0 z-10 bg-surface-subtle px-5 py-4 text-right">Action</th></tr></thead><tbody>{rows.length ? rows.map((row) => {
    const customer = customers.get(row.customerId);
    const villa = villas.get(row.villaId);
    const project = projects.get(row.projectId);
    const receipt = row.collection ? receipts.get(row.collection.id) : undefined;
    return <tr className="border-t" key={row.id}>
      <td className="whitespace-nowrap px-5 py-4"><p className="font-medium">{formatDate(row.dueDate)}</p>{row.paymentDate && <p className="mt-1 text-xs text-muted-foreground">Paid {formatDate(row.paymentDate)}</p>}</td>
      <td className="px-5 py-4">{receipt ? <><p className="font-semibold">{receipt.number}</p><p className="mt-1 text-xs text-muted-foreground">{row.collection?.referenceNumber}</p></> : <span className="text-muted-foreground">&mdash;</span>}</td>
      <td className="px-5 py-4 font-medium">{customer?.fullName ?? "Unknown customer"}</td>
      <td className="px-5 py-4"><p className="font-medium">{villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Unknown villa"}</p><p className="mt-1 text-xs text-muted-foreground">{row.stage ?? project?.location ?? ""}</p></td>
      <td className="px-5 py-4 capitalize">{row.collection ? row.collection.paymentMethod.replace("_", " ") : <span className="text-muted-foreground">&mdash;</span>}</td>
      <td className="px-5 py-4 font-semibold">{formatLkr(row.principalAmount)}</td>
      <td className="px-5 py-4 font-semibold">{formatLkr(row.interestAmount)}</td>
      <td className="px-5 py-4 font-semibold">{formatLkr(row.totalAmount)}</td>
      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${rowStatusClasses[row.status]}`}>{collectionRowStatusLabels[row.status]}</span></td>
      <td className="sticky right-0 z-10 bg-surface px-5 py-4 text-right"><CollectionRowActions database={database} row={row} /></td>
    </tr>;
  }) : <tr><td className="px-5 py-10 text-center text-muted-foreground" colSpan={10}>No payments match these filters.</td></tr>}</tbody></table></div>;
}

function ReminderTable({ approvals, database, onReview }: { approvals: ReminderApproval[]; database: MockDatabase; onReview: (approval: ReminderApproval) => void }) {
  const customers = new Map(database.customers.map((customer) => [customer.id, customer]));
  const villas = new Map(database.villas.map((villa) => [villa.id, villa]));
  const projects = new Map(database.projects.map((project) => [project.id, project]));
  const users = new Map(database.users.map((user) => [user.id, user]));
  return <div className="overflow-x-auto rounded-lg border bg-surface"><table className="min-w-[68rem] w-full text-left text-sm"><thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Villa</th><th className="px-5 py-4">Send date</th><th className="px-5 py-4">Requested by</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Villa</th><th className="sticky right-0 z-10 bg-surface-subtle px-5 py-4 text-right">Action</th></tr></thead><tbody>{approvals.length ? approvals.map((approval) => { const customer = customers.get(approval.customerId); const villa = villas.get(approval.villaId); const project = villa ? projects.get(villa.projectId) : null; const requester = approval.requestedBy ? users.get(approval.requestedBy) : null; return <tr className="border-t" key={approval.id}><td className="px-5 py-4 font-medium">{customer?.fullName ?? "Unknown customer"}</td><td className="px-5 py-4"><p className="font-medium">{villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Unknown villa"}</p><p className="mt-1 text-xs text-muted-foreground">{project?.location ?? ""}</p></td><td className="whitespace-nowrap px-5 py-4">{formatDate(approval.sendDate)}</td><td className="px-5 py-4"><p className="font-semibold">{requester?.name ?? "System generated"}</p><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(approval.requestedAt)}</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${approvalClasses[approval.status]}`}>{approvalLabels[approval.status]}</span></td><td className="px-5 py-4"><Link className="font-semibold hover:text-muted-foreground" href={`/projects/${villa?.projectId}/villas/${villa?.id}`}>View villa</Link></td><td className="sticky right-0 z-10 bg-surface px-5 py-4 text-right"><Button disabled={approval.status === "cancelled" || approval.status === "sent"} aria-label={`Review reminder for ${customer?.fullName ?? "customer"}`} onClick={() => onReview(approval)} variant="outline">Review</Button></td></tr>; }) : <tr><td className="px-5 py-10 text-center text-muted-foreground" colSpan={7}>No reminders match these filters.</td></tr>}</tbody></table></div>;
}

function CollectionSummaryCards({ database }: { database: MockDatabase }) {
  const summary = useMemo(() => {
    const activeVillas = database.villas.filter(isVillaActive);
    const villaMap = new Map(activeVillas.map((villa) => [villa.id, villa]));
    const collectionsThisMonth = database.collections.filter((collection) => villaMap.has(collection.villaId) && collection.status === "confirmed" && collection.paymentDate.startsWith(database.today.slice(0, 7)));
    const schedules = database.schedules.flatMap((schedule) => villaMap.has(schedule.villaId) ? [schedule] : []);
    const dueWithinSixtyDays = schedules.filter((schedule) => isPaymentScheduleReady(schedule) && schedule.dueDate >= database.today && schedule.dueDate <= addDays(database.today, 60) && principalOutstanding(schedule) > 0);
    const overdue = schedules.filter((schedule) => paymentStatus(schedule, database.today) === "overdue" && principalOutstanding(schedule) > 0);
    const interest = activeVillas.reduce((total, villa) => {
      const terms = resolveInterestTerms(database.settings, villa);
      return total + calculateVillaFinancials(database.schedules.filter((schedule) => schedule.villaId === villa.id), terms, database.today).interestOutstanding;
    }, 0);
    return { collected: { value: collectionsThisMonth.reduce((total, collection) => total + collection.totalAmount, 0), count: collectionsThisMonth.length }, due: { value: dueWithinSixtyDays.reduce((total, schedule) => total + principalOutstanding(schedule), 0), count: dueWithinSixtyDays.length }, overdue: { value: overdue.reduce((total, schedule) => total + principalOutstanding(schedule), 0), count: overdue.length }, interest };
  }, [database]);
  const cards = [
    { label: "Collected this month", value: summary.collected.value, detail: `${summary.collected.count} ${summary.collected.count === 1 ? "payment" : "payments"} received`, icon: CheckCircle2, iconClass: "bg-success/10 text-success", cardClass: "" },
    { label: "Due in next 60 days", value: summary.due.value, detail: `${summary.due.count} scheduled ${summary.due.count === 1 ? "payment" : "payments"}`, icon: CalendarDays, iconClass: "bg-sky-100 text-sky-700", cardClass: "" },
    { label: "Overdue", value: summary.overdue.value, detail: `${summary.overdue.count} ${summary.overdue.count === 1 ? "requires" : "require"} follow-up`, icon: AlertTriangle, iconClass: "bg-danger/10 text-danger", cardClass: "border-danger/30" },
    { label: "Interest outstanding", value: summary.interest, detail: "Calculated from agreement terms", icon: Clock3, iconClass: "bg-warning/15 text-warning", cardClass: "" },
  ];
  return <section aria-label="Collection summary" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <article className={`rounded-lg border bg-surface p-5 ${card.cardClass}`} key={card.label}><div className="flex items-start gap-4"><span className={`grid size-12 shrink-0 place-items-center rounded-md ${card.iconClass}`}><Icon className="size-6" /></span><div className="min-w-0"><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 text-xl font-semibold">{formatLkr(card.value)}</p><p className="mt-2 text-xs text-muted-foreground">{card.detail}</p></div></div></article>; })}</section>;
}

/** `initialData`: fetched server-side by `app/collections/page.tsx`. See dashboard-page-client.tsx for why it stays optional. */
export function CollectionsPageClient({ database }: { database: MockDatabase }) {
  return <AppShell active="Collections"><CollectionsPageBody database={database} /></AppShell>;
}

/**
 * Split out from `CollectionsPageClient` so `useCurrentUser()` below actually works.
 * `CollectionsPageClient` returns `<AppShell>{...}</AppShell>` — everything inside those
 * braces is built during `CollectionsPageClient`'s own render, before `AppShell` has
 * wrapped anything in `CurrentUserProvider`, so a hook called directly in that outer
 * function reads the context from *above* `AppShell` and gets null forever ("Reminder
 * approvals" was invisible to every Super Admin as a result). A separate component
 * rendered as an actual child of `AppShell` sees the provider correctly.
 */
function CollectionsPageBody({ database }: { database: MockDatabase }) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [view, setView] = useState<View>("all"); const [collectionOpen, setCollectionOpen] = useState(false); const [selectedApproval, setSelectedApproval] = useState<ReminderApproval | null>(null); const [search, setSearch] = useState(""); const [projectId, setProjectId] = useState("all"); const [customerId, setCustomerId] = useState("all"); const [collectionStatus, setCollectionStatus] = useState("all"); const [approvalStatus, setApprovalStatus] = useState("all"); const [month, setMonth] = useState("all");
  const rows = useMemo(() => buildCollectionRows(database).filter((row) => {
    const customer = database.customers.find((candidate) => candidate.id === row.customerId);
    const villa = database.villas.find((candidate) => candidate.id === row.villaId);
    const matchesSearch = `${customer?.fullName ?? ""} ${villa?.number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (projectId === "all" || row.projectId === projectId) && (customerId === "all" || row.customerId === customerId) && (collectionStatus === "all" || row.status === collectionStatus);
  }), [collectionStatus, customerId, database, projectId, search]);
  const approvals = useMemo(() => database.reminderApprovals.filter((approval) => { const customer = database.customers.find((candidate) => candidate.id === approval.customerId); const villa = database.villas.find((candidate) => candidate.id === approval.villaId); const matchesSearch = `${customer?.fullName ?? ""} ${villa?.number ?? ""}`.toLowerCase().includes(search.toLowerCase()); return matchesSearch && (projectId === "all" || villa?.projectId === projectId) && (approvalStatus === "all" || approval.status === approvalStatus) && (month === "all" || approval.sendDate.slice(5, 7) === month); }), [approvalStatus, database, month, projectId, search]);
  const { toast } = useToast();
  const isSuperAdmin = currentUser?.role === "super_admin";
  return <><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold">Collections</h1><p className="mt-2 text-muted-foreground">Record, review and reprint customer payments.</p></div><Button onClick={() => setCollectionOpen(true)}>Add collection <Plus className="size-4" /></Button></div>{view === "all" && <CollectionSummaryCards database={database} />}<div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => setView("all")} size="sm" variant={view === "all" ? "default" : "outline"}>All</Button>{isSuperAdmin && <Button onClick={() => setView("reminders")} size="sm" variant={view === "reminders" ? "default" : "outline"}>Reminder approvals</Button>}</div>{view === "reminders" && isSuperAdmin ? <section className="mt-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Super Admin controls</p><h2 className="mt-3 text-2xl font-medium">Reminder approval queue</h2><p className="mt-2 text-sm text-muted-foreground">Review the final message and send date before anything reaches the customer.</p></div><p className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-xs font-semibold"><ShieldCheck className="size-4" />Manual approval required</p></div><div className="mt-6 flex flex-wrap gap-3">{([['all', 'All'], ['awaiting_approval', 'Awaiting approval'], ['sent', 'Sent'], ['ready_to_send', 'Ready to send'], ['cancelled', 'Cancelled']] as const).map(([status, label]) => <Button key={status} onClick={() => setApprovalStatus(status)} size="sm" variant={approvalStatus === status ? "default" : "outline"}>{label}</Button>)}</div><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,.6fr))]"><label className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input className="h-12 w-full rounded-md border bg-surface pl-11 pr-4 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" value={search} /></label><SelectControl onChange={setMonth} value={month}><SelectItem value="all">All months</SelectItem><SelectItem value="08">August</SelectItem><SelectItem value="09">September</SelectItem></SelectControl><SelectControl onChange={setProjectId} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectControl><SelectControl onChange={setApprovalStatus} value={approvalStatus}><SelectItem value="all">All statuses</SelectItem><SelectItem value="awaiting_approval">Awaiting approval</SelectItem><SelectItem value="ready_to_send">Ready to send</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectControl></div><div className="mt-4"><ReminderTable approvals={approvals} database={database} onReview={setSelectedApproval} /></div></section> : <section className="mt-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,.6fr))]"><label className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input className="h-12 w-full rounded-md border bg-surface pl-11 pr-4 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" value={search} /></label><SelectControl onChange={setProjectId} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectControl><SelectControl onChange={setCustomerId} value={customerId}><SelectItem value="all">All customers</SelectItem>{database.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.fullName}</SelectItem>)}</SelectControl><SelectControl onChange={setCollectionStatus} value={collectionStatus}><SelectItem value="all">All statuses</SelectItem>{(["overdue", "due", "due_soon", "not_due", "partially_paid", "confirmed", "superseded"] as const).map((status) => <SelectItem key={status} value={status}>{collectionRowStatusLabels[status]}</SelectItem>)}</SelectControl></div><div className="mt-4"><CollectionTable database={database} rows={rows} /></div></section>}{collectionOpen && <RecordPaymentDialog database={database} onClose={() => setCollectionOpen(false)} onSuccess={(message) => { setCollectionOpen(false); toast(message); router.refresh(); }} />}{selectedApproval && <ReminderReviewDialog approval={selectedApproval} database={database} onClose={() => setSelectedApproval(null)} onSuccess={(message) => { setSelectedApproval(null); toast(message); router.refresh(); }} />}</>;
}
