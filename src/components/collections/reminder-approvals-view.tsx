"use client";

import { Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ReminderReviewDialog } from "@/components/collections/reminder-review-dialog";
import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE, Pagination, usePagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { queueDueRemindersAction } from "@/lib/actions/reminders";
import { villaLabel } from "@/lib/domain/villa-label";
import type { MockDatabase, ReminderApproval, ReminderApprovalStatus } from "@/lib/domain/types";

const approvalLabels: Record<ReminderApprovalStatus, string> = { awaiting_approval: "Awaiting approval", cancelled: "Cancelled", ready_to_send: "Ready to send", sent: "Sent" };
const approvalClasses: Record<ReminderApprovalStatus, string> = { awaiting_approval: "bg-warning/15 text-warning", cancelled: "bg-danger/10 text-danger", ready_to_send: "bg-surface-muted text-primary", sent: "bg-success/10 text-success" };
const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

/**
 * The current month and the next three, as `YYYY-MM` values — reminders are sent in the
 * near future, so a rolling window from the workspace's own date is what the filter needs.
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

function SelectControl({ children, onChange, value }: { children: React.ReactNode; onChange: (value: string) => void; value: string }) {
  return <label className="relative block"><Select onValueChange={onChange} value={value}><SelectTrigger className="h-12 px-4 text-sm font-semibold"><SelectValue /></SelectTrigger><SelectContent>{children}</SelectContent></Select></label>;
}


/**
 * The Super Admin's reminder approval queue, as its own screen.
 *
 * Split out of the Collections page because the two tabs are genuinely different things —
 * one lists money owed and received, the other lists pending customer emails, with their
 * own filters, sorting and pagination. They share a page only because the design puts them
 * behind one pair of tabs.
 *
 * Queuing runs HERE, on mount, rather than on every Collections page load. Only a Super
 * Admin can see this table, so scanning every unpaid stage whenever a Staff member opened
 * Collections was work for a screen they can never reach.
 */
export function ReminderApprovalsView({ database }: { database: MockDatabase }) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [approvalStatus, setApprovalStatus] = useState("all");
  const [month, setMonth] = useState("all");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [selectedApproval, setSelectedApproval] = useState<ReminderApproval | null>(null);
  const [queueing, startQueueing] = useTransition();
  // A ref, not state: this only guards against re-running, and writing state from an
  // effect would trigger the render it is trying to avoid.
  const hasQueued = useRef(false);

  useEffect(() => {
    if (hasQueued.current) return;
    hasQueued.current = true;
    startQueueing(async () => {
      try {
        const result = await queueDueRemindersAction();
        // Only refetch when something actually landed — a no-op scan should not cost a
        // full page round-trip, which is the common case once the queue is caught up.
        if (result.queued > 0) router.refresh();
      } catch {
        // A queueing failure must not blank the table. Whatever is already queued still
        // renders; the next visit tries again.
      }
    });
  }, [router]);

  const approvals = useMemo(() => database.reminderApprovals.filter((approval) => {
    const customer = database.customers.find((candidate) => candidate.id === approval.customerId);
    const villa = database.villas.find((candidate) => candidate.id === approval.villaId);
    const matchesSearch = `${customer?.fullName ?? ""} ${villa?.number ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch
      && (projectId === "all" || villa?.projectId === projectId)
      && (approvalStatus === "all" || approval.status === approvalStatus)
      && (month === "all" || approval.sendDate.slice(0, 7) === month);
  }), [approvalStatus, database, month, projectId, search]);

  const paged = usePagination(approvals, pageSize);
  const showSkeleton = queueing && approvals.length === 0;

  return <section className="mt-7">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Super Admin controls</p>
        <h2 className="mt-3 text-2xl font-medium">Reminder approval queue</h2>
        <p className="mt-2 text-sm text-muted-foreground">Review the final message and send date before anything reaches the customer.</p>
      </div>
      <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-xs font-semibold"><ShieldCheck className="size-4" />Manual approval required</p>
    </div>
    <div className="mt-6 flex flex-wrap gap-3">{([['all', 'All'], ['awaiting_approval', 'Awaiting approval'], ['sent', 'Sent'], ['ready_to_send', 'Ready to send'], ['cancelled', 'Cancelled']] as const).map(([status, label]) => <Button key={status} onClick={() => setApprovalStatus(status)} size="sm" variant={approvalStatus === status ? "default" : "outline"}>{label}</Button>)}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,.6fr))]">
      <label className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><input className="h-12 w-full rounded-md border bg-surface pl-11 pr-4 text-sm font-medium outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa or customer name" value={search} /></label>
      <SelectControl onChange={setMonth} value={month}><SelectItem value="all">All months</SelectItem>{upcomingMonths(database.today).map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectControl>
      <SelectControl onChange={setProjectId} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectControl>
      <SelectControl onChange={setApprovalStatus} value={approvalStatus}><SelectItem value="all">All statuses</SelectItem><SelectItem value="awaiting_approval">Awaiting approval</SelectItem><SelectItem value="ready_to_send">Ready to send</SelectItem><SelectItem value="sent">Sent</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectControl>
    </div>
    <div className="mt-4" aria-busy={showSkeleton}>
      {showSkeleton
        ? <><span className="sr-only" role="status">Checking for reminders due…</span><SkeletonTable columns={7} rows={5} /></>
        : <><ReminderTable approvals={paged.visible} database={database} onReview={setSelectedApproval} />
          <Pagination label="reminders" onPageChange={paged.setPage} onPageSizeChange={setPageSize} page={paged.page} pageCount={paged.pageCount} pageSize={pageSize} total={approvals.length} /></>}
    </div>
    {selectedApproval && <ReminderReviewDialog approval={selectedApproval} database={database} onClose={() => setSelectedApproval(null)} onSuccess={(message) => { setSelectedApproval(null); toast(message); router.refresh(); }} />}
  </section>;
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
  return <div className="overflow-x-auto rounded-lg border bg-surface"><table className="w-full min-w-[48rem] table-fixed text-left"><colgroup><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[20%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[9%]" /></colgroup><thead className="bg-surface-subtle text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Villa</th><th className="px-3 py-3">Send date</th><th className="px-3 py-3">Requested by</th><th className="px-3 py-3">Status</th><th aria-label="Open villa" className="px-3 py-3" /><th className="sticky right-0 z-10 bg-surface-subtle px-3 py-3 text-right">Action</th></tr></thead><tbody>{approvals.length ? approvals.map((approval) => { const customer = customers.get(approval.customerId); const villa = villas.get(approval.villaId); const project = villa ? projects.get(villa.projectId) : null; const requester = approval.requestedBy ? users.get(approval.requestedBy) : null; return <tr className="border-t text-[11px] leading-[1.5]" key={approval.id}><td className="truncate px-3 py-3 font-medium" title={customer?.fullName}>{customer?.fullName ?? "Unknown customer"}</td><td className="truncate px-3 py-3" title={project?.location ?? ""}><span className="block truncate font-medium">{villaLabel(villa?.number) ?? "Unknown villa"}</span><span className="mt-0.5 block truncate text-[9px] tracking-[0.17px] text-muted-foreground">{project?.location ?? ""}</span></td><td className="whitespace-nowrap px-3 py-3">{formatDate(approval.sendDate)}</td><td className="truncate px-3 py-3" title={requester?.name ?? "System generated"}><span className="block truncate font-semibold">{requester?.name ?? "System generated"}</span><span className="mt-0.5 block whitespace-nowrap text-[9px] tracking-[0.17px] text-muted-foreground">{formatDateTime(approval.requestedAt)}</span></td><td className="px-3 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold ${approvalClasses[approval.status]}`}>{approvalLabels[approval.status]}</span></td><td className="px-3 py-3"><Link className="whitespace-nowrap font-semibold hover:text-muted-foreground" href={`/projects/${villa?.projectId}/villas/${villa?.id}`}>View villa</Link></td><td className="sticky right-0 z-10 bg-surface px-3 py-3 text-right"><Button className="h-8 px-3 text-[11px]" aria-label={`${approval.status === "cancelled" || approval.status === "sent" ? "View" : "Review"} reminder for ${customer?.fullName ?? "customer"}`} onClick={() => onReview(approval)} variant="outline">{approval.status === "cancelled" || approval.status === "sent" ? "View" : "Review"}</Button></td></tr>; }) : <tr><td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={7}>No reminders match these filters.</td></tr>}</tbody></table></div>;
}
