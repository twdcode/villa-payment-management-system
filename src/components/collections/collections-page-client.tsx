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
import { DEFAULT_PAGE_SIZE, Pagination, usePagination } from "@/components/ui/pagination";
import type { MockDatabase, ReminderApproval, ReminderApprovalStatus } from "@/lib/domain/types";
import { collectionRowStatusLabels } from "@/lib/domain/status-labels";
import { buildCollectionRows, type CollectionRow, type CollectionRowStatus } from "@/lib/domain/collection-rows";
import { addDays, calculateVillaFinancials, isPaymentScheduleReady, paymentStatus, principalOutstanding } from "@/lib/finance/calculations";
import { formatLkr, numberToWordsLkr } from "@/lib/formatters";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { isVillaActive } from "@/lib/domain/villa-status";
import { villaLabel } from "@/lib/domain/villa-label";
import { useCurrentUser } from "@/components/auth/current-user-provider";


type View = "all" | "reminders";

const approvalLabels: Record<ReminderApprovalStatus, string> = { awaiting_approval: "Awaiting approval", cancelled: "Cancelled", ready_to_send: "Ready to send", sent: "Sent" };
const approvalClasses: Record<ReminderApprovalStatus, string> = { awaiting_approval: "bg-warning/15 text-warning", cancelled: "bg-danger/10 text-danger", ready_to_send: "bg-surface-muted text-primary", sent: "bg-success/10 text-success" };
const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
/**
 * `2026/08/12` — the compact form the Collections table uses.
 *
 * The table has ten columns to fit without horizontal scroll, and a date is the one field
 * where a shorter representation costs nothing: it stays unambiguous, sorts the same, and
 * saves roughly 40px per row against `Nov 21, 2026`. Every other screen keeps the long
 * form, which reads better where there is room for it.
 */
const formatDateCompact = (value: string) => value.replaceAll("-", "/");

/**
 * The current month and the next three, as `YYYY-MM` values.
 *
 * The options used to be two hardcoded entries, August and September — which matched
 * nothing from October onwards and could never match another year. Reminders are sent in
 * the near future, so a rolling window from the workspace's own date is what the filter
 * is actually for. Compared on the full `YYYY-MM` rather than the month alone, so
 * September 2026 and September 2027 are not the same option.
 */
function upcomingMonths(today: string) {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: 4 }, (_, offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return {
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-LK", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
    };
  });
}

/**
 * `47,000,000` — the amount alone, no currency prefix.
 *
 * The three money columns already carry `(LKR)` in their headers, so repeating it in
 * every cell costs horizontal space the table does not have and adds nothing. Cards and
 * dialogs still use `formatLkr`, where the prefix is the only thing naming the currency.
 */
const formatAmount = (value: number) => new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(value);

/**
 * The amount in words, without the trailing "rupees".
 *
 * `numberToWordsLkr` writes "forty-seven million rupees" because it is used where the
 * figure stands alone. Here the column header already says `(LKR)`, so the suffix is
 * noise in a 9px line that has to stay on one row — and "Zero Rupees" under a zero
 * interest cell reads worse than nothing at all.
 */
const amountInWords = (value: number) => (value === 0 ? "" : numberToWordsLkr(value).replace(/ rupees?$/, ""));
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

  return <div className="overflow-x-auto rounded-lg border bg-surface">
    {/*
      Sized to the design: 11px primary text, 9px secondary, and every cell on a single
      line. `table-fixed` plus a colgroup is what keeps it that way — with auto layout the
      browser widens each column to its longest value anywhere in the table (one long
      customer name pushed the whole row past the viewport), so the columns are given
      explicit shares instead and the two free-text fields truncate.
    */}
    <table className="w-full min-w-[52rem] table-fixed text-left">
      <colgroup>
        <col className="w-[9%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[10%]" />
        <col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[8%]" /><col className="w-[6%]" />
      </colgroup>
      <thead className="bg-surface-subtle text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <tr>
          <th className="px-3 py-3">Date</th>
          <th className="px-3 py-3">Receipt</th>
          <th className="px-3 py-3">Customer</th>
          <th className="px-3 py-3">Villa</th>
          <th className="px-3 py-3">Method</th>
          <th className="px-3 py-3">Principal (LKR)</th>
          <th className="px-3 py-3">Interest (LKR)</th>
          <th className="px-3 py-3">Total (LKR)</th>
          <th className="px-3 py-3">Status</th>
          <th className="sticky right-0 z-10 bg-surface-subtle px-3 py-3 text-right">Action</th>
        </tr>
      </thead>
      <tbody className="text-[11px] leading-[1.5]">{rows.length ? rows.map((row) => {
        const customer = customers.get(row.customerId);
        const villa = villas.get(row.villaId);
        const project = projects.get(row.projectId);
        const receipt = row.collection ? receipts.get(row.collection.id) : undefined;
        return <tr className="border-t" key={row.id}>
          <td className="whitespace-nowrap px-3 py-3">{formatDateCompact(row.dueDate)}{row.paymentDate && <span className="mt-0.5 block text-[9px] tracking-[0.17px] text-muted-foreground">Paid {formatDateCompact(row.paymentDate)}</span>}</td>
          <td className="truncate px-3 py-3">{receipt ? <><span className="block truncate font-bold">{receipt.number}</span><span className="mt-0.5 block truncate text-[9px] tracking-[0.17px] text-muted-foreground">{row.collection?.referenceNumber}</span></> : <span className="text-muted-foreground">&mdash;</span>}</td>
          <td className="truncate px-3 py-3" title={customer?.fullName}>{customer?.fullName ?? "Unknown customer"}</td>
          <td className="truncate px-3 py-3" title={row.stage ?? project?.location ?? ""}><span className="block truncate">{villaLabel(villa?.number) ?? "Unknown villa"}</span><span className="mt-0.5 block truncate text-[9px] tracking-[0.17px] text-muted-foreground">{row.stage ?? project?.location ?? ""}</span></td>
          <td className="truncate px-3 py-3 capitalize">{row.collection ? row.collection.paymentMethod.replace("_", " ") : <span className="text-muted-foreground">&mdash;</span>}</td>
          <td className="px-3 py-3"><span className="block truncate font-bold">{formatAmount(row.principalAmount)}</span><span className="mt-0.5 block truncate text-[9px] capitalize tracking-[0.17px] text-muted-foreground">{amountInWords(row.principalAmount)}</span></td>
          <td className="px-3 py-3"><span className="block truncate font-bold">{formatAmount(row.interestAmount)}</span><span className="mt-0.5 block truncate text-[9px] capitalize tracking-[0.17px] text-muted-foreground">{amountInWords(row.interestAmount)}</span></td>
          <td className="px-3 py-3"><span className="block truncate font-bold">{formatAmount(row.totalAmount)}</span><span className="mt-0.5 block truncate text-[9px] capitalize tracking-[0.17px] text-muted-foreground">{amountInWords(row.totalAmount)}</span></td>
          <td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${rowStatusClasses[row.status]}`}>{collectionRowStatusLabels[row.status]}</span></td>
          <td className="sticky right-0 z-10 bg-surface px-3 py-3 text-right"><CollectionRowActions database={database} row={row} /></td>
        </tr>;
      }) : <tr><td className="px-3 py-10 text-center text-muted-foreground" colSpan={10}>No payments match these filters.</td></tr>}</tbody>
    </table>
  </div>;
}

/**
 * The Super Admin's reminder approval queue.
 *
 * Two details worth keeping: the sixth column deliberately has NO visible heading — it
 * holds the link through to the villa, not a second villa value, and labelling it "Villa"
 * read as a duplicate of the column two across. Its accessible name comes from
 * `aria-label` on the `<th>` rather than an `sr-only` span, because Tailwind's `sr-only`
 * positions the span absolutely and inside a `table-fixed` header that extends the
 * document's scrollable width — enough to make the whole page scroll sideways on a phone.
 */
function ReminderTable({ approvals, database, onReview }: { approvals: ReminderApproval[]; database: MockDatabase; onReview: (approval: ReminderApproval) => void }) {
  const customers = new Map(database.customers.map((customer) => [customer.id, customer]));
  const villas = new Map(database.villas.map((villa) => [villa.id, villa]));
  const projects = new Map(database.projects.map((project) => [project.id, project]));
  const users = new Map(database.users.map((user) => [user.id, user]));
  return <div className="overflow-x-auto rounded-lg border bg-surface"><table className="w-full min-w-[48rem] table-fixed text-left"><colgroup><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[9%]" /></colgroup><thead className="bg-surface-subtle text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Villa</th><th className="px-3 py-3">Send date</th><th className="px-3 py-3">Requested by</th><th className="px-3 py-3">Status</th><th aria-label="Open villa" className="px-3 py-3" /><th className="sticky right-0 z-10 bg-surface-subtle px-3 py-3 text-right">Action</th></tr></thead><tbody>{approvals.length ? approvals.map((approval) => { const customer = customers.get(approval.customerId); const villa = villas.get(approval.villaId); const project = villa ? projects.get(villa.projectId) : null; const requester = approval.requestedBy ? users.get(approval.requestedBy) : null; return <tr className="border-t text-[11px] leading-[1.5]" key={approval.id}><td className="truncate px-3 py-3 font-medium" title={customer?.fullName}>{customer?.fullName ?? "Unknown customer"}</td><td className="truncate px-3 py-3" title={project?.location ?? ""}><span className="block truncate font-medium">{villaLabel(villa?.number) ?? "Unknown villa"}</span><span className="mt-0.5 block truncate text-[9px] tracking-[0.17px] text-muted-foreground">{project?.location ?? ""}</span></td><td className="whitespace-nowrap px-3 py-3">{formatDate(approval.sendDate)}</td><td className="truncate px-3 py-3" title={requester?.name ?? "System generated"}><span className="block truncate font-semibold">{requester?.name ?? "System generated"}</span><span className="mt-0.5 block whitespace-nowrap text-[9px] tracking-[0.17px] text-muted-foreground">{formatDateTime(approval.requestedAt)}</span></td><td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${approvalClasses[approval.status]}`}>{approvalLabels[approval.status]}</span></td><td className="px-3 py-3"><Link className="whitespace-nowrap font-semibold hover:text-muted-foreground" href={`/projects/${villa?.projectId}/villas/${villa?.id}`}>View villa</Link></td><td className="sticky right-0 z-10 bg-surface px-3 py-3 text-right"><Button className="h-8 px-3 text-[11px]" disabled={approval.status === "cancelled" || approval.status === "sent"} aria-label={`Review reminder for ${customer?.fullName ?? "customer"}`} onClick={() => onReview(approval)} variant="outline">Review</Button></td></tr>; }) : <tr><td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={7}>No reminders match these filters.</td></tr>}</tbody></table></div>;
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
  const [view, setView] = useState<View>("all"); const [collectionOpen, setCollectionOpen] = useState(false); const [selectedApproval, setSelectedApproval] = useState<ReminderApproval | null>(null); const [search, setSearch] = useState(""); const [projectId, setProjectId] = useState("all"); const [customerId, setCustomerId] = useState("all"); const [collectionStatus, setCollectionStatus] = useState("all"); const [approvalStatus, setApprovalStatus] = useState("all"); const [month, setMonth] = useState("all"); const [villaId, setVillaId] = useState("all"); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [rowsPageSize, setRowsPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [approvalsPageSize, setApprovalsPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const receiptsByCollection = useMemo(() => new Map(database.receipts.map((receipt) => [receipt.collectionId, receipt.number])), [database.receipts]);
  const rows = useMemo(() => buildCollectionRows(database).filter((row) => {
    const customer = database.customers.find((candidate) => candidate.id === row.customerId);
    const villa = database.villas.find((candidate) => candidate.id === row.villaId);
    // Receipt number is searchable too: someone holding a printed receipt has that number
    // and nothing else, and looking it up by guessing the customer is not a search.
    const receiptNumber = row.collection ? receiptsByCollection.get(row.collection.id) ?? "" : "";
    const matchesSearch = `${customer?.fullName ?? ""} ${villa?.number ?? ""} ${receiptNumber} ${row.collection?.referenceNumber ?? ""}`.toLowerCase().includes(search.toLowerCase());
    // Range is inclusive and each end is optional, so "everything from March" works without
    // having to invent an end date. Compared on the row's due date, the column the table
    // sorts by, so the filter matches what the user is looking at.
    const matchesFrom = !dateFrom || row.dueDate >= dateFrom;
    const matchesTo = !dateTo || row.dueDate <= dateTo;
    return matchesSearch && matchesFrom && matchesTo
      && (projectId === "all" || row.projectId === projectId)
      && (villaId === "all" || row.villaId === villaId)
      && (customerId === "all" || row.customerId === customerId)
      && (collectionStatus === "all" || row.status === collectionStatus);
  }), [collectionStatus, customerId, database, dateFrom, dateTo, projectId, receiptsByCollection, search, villaId]);
  const approvals = useMemo(() => database.reminderApprovals.filter((approval) => { const customer = database.customers.find((candidate) => candidate.id === approval.customerId); const villa = database.villas.find((candidate) => candidate.id === approval.villaId); const matchesSearch = `${customer?.fullName ?? ""} ${villa?.number ?? ""}`.toLowerCase().includes(search.toLowerCase()); return matchesSearch && (projectId === "all" || villa?.projectId === projectId) && (approvalStatus === "all" || approval.status === approvalStatus) && (month === "all" || approval.sendDate.slice(0, 7) === month); }), [approvalStatus, database, month, projectId, search]);
  const { toast } = useToast();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const rowsPage = usePagination(rows, rowsPageSize);
  const approvalsPage = usePagination(approvals, approvalsPageSize);

  return <><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold">Collections</h1><p className="mt-2 text-muted-foreground">Record, review and reprint customer payments.</p></div><Button onClick={() => setCollectionOpen(true)}>Add collection <Plus className="size-4" /></Button></div>{view === "all" && <CollectionSummaryCards database={database} />}<div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => setView("all")} size="sm" variant={view === "all" ? "default" : "outline"}>All</Button>{isSuperAdmin && <Button onClick={() => setView("reminders")} size="sm" variant={view === "reminders" ? "default" : "outline"}>Reminder approvals</Button>}</div>{view === "reminders" && isSuperAdmin ? <section className="mt-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Super Admin controls</p><h2 className="mt-3 text-2xl font-medium">Reminder approval queue</h2><p className="mt-2 text-sm text-muted-foreground">Review the final message and send date before anything reaches the customer.</p></div><p className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-xs font-semibold"><ShieldCheck className="size-4" />Manual approval required</p></div><div className="mt-6 flex flex-wrap gap-3">{([['all', 'All'], ['awaiting_approval', 'Awaiting approval'], ['sent', 'Sent'], ['ready_to_send', 'Ready to send'], ['cancelled', 'Cancelled']] as const).map(([status, label]) => <Button key={status} onClick={() => setApprovalStatus(status)} size="sm" variant={approvalStatus === status ? "default" : "outline"}>{label}</Button>)}</div><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,.6fr))]"><label className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input className="h-12 w-full rounded-md border bg-surface pl-11 pr-4 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" value={search} /></label><SelectControl onChange={setMonth} value={month}><SelectItem value="all">All months</SelectItem>{upcomingMonths(database.today).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectControl><SelectControl onChange={setProjectId} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectControl><SelectControl onChange={setApprovalStatus} value={approvalStatus}><SelectItem value="all">All statuses</SelectItem><SelectItem value="awaiting_approval">Awaiting approval</SelectItem><SelectItem value="ready_to_send">Ready to send</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectControl></div><div className="mt-4"><ReminderTable approvals={approvalsPage.visible} database={database} onReview={setSelectedApproval} /><Pagination label="reminders" onPageChange={approvalsPage.setPage} onPageSizeChange={setApprovalsPageSize} page={approvalsPage.page} pageCount={approvalsPage.pageCount} pageSize={approvalsPageSize} total={approvals.length} /></div></section> : <section className="mt-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,.6fr))]"><label className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input className="h-12 w-full rounded-md border bg-surface pl-11 pr-4 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" value={search} /></label><SelectControl onChange={setProjectId} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectControl><SelectControl onChange={setVillaId} value={villaId}><SelectItem value="all">All villas</SelectItem>{database.villas.filter((candidate) => projectId === "all" || candidate.projectId === projectId).map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{villaLabel(candidate.number)}</SelectItem>)}</SelectControl><SelectControl onChange={setCustomerId} value={customerId}><SelectItem value="all">All customers</SelectItem>{database.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.fullName}</SelectItem>)}</SelectControl><SelectControl onChange={setCollectionStatus} value={collectionStatus}><SelectItem value="all">All statuses</SelectItem>{(["overdue", "due", "due_soon", "not_due", "partially_paid", "confirmed", "superseded"] as const).map((status) => <SelectItem key={status} value={status}>{collectionRowStatusLabels[status]}</SelectItem>)}</SelectControl></div><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold text-muted-foreground"><span className="mb-2 block">Due from</span><input className="h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground sm:w-44" max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label><label className="text-sm font-semibold text-muted-foreground"><span className="mb-2 block">Due to</span><input className="h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground sm:w-44" min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>{(dateFrom || dateTo) && <Button className="h-12" onClick={() => { setDateFrom(""); setDateTo(""); }} type="button" variant="ghost">Clear dates</Button>}</div><div className="mt-4"><CollectionTable database={database} rows={rowsPage.visible} /><Pagination label="payments" onPageChange={rowsPage.setPage} onPageSizeChange={setRowsPageSize} page={rowsPage.page} pageCount={rowsPage.pageCount} pageSize={rowsPageSize} total={rows.length} /></div></section>}{collectionOpen && <RecordPaymentDialog database={database} onClose={() => setCollectionOpen(false)} onSuccess={(message) => { setCollectionOpen(false); toast(message); router.refresh(); }} />}{selectedApproval && <ReminderReviewDialog approval={selectedApproval} database={database} onClose={() => setSelectedApproval(null)} onSuccess={(message) => { setSelectedApproval(null); toast(message); router.refresh(); }} />}</>;
}
