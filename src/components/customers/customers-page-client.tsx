"use client";

import { Check, Home, Lock, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { z } from "zod";

import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PAGE_SIZE, Pagination, usePagination } from "@/components/ui/pagination";
import type { Customer, MockDatabase, PaymentSchedule, Villa } from "@/lib/domain/types";
import { formatLkr } from "@/lib/formatters";
import { villaStatusLabels } from "@/lib/domain/status-labels";
import { calculateVillaFinancials } from "@/lib/finance/calculations";
import { createCustomerAction, updateCustomerAction, addCustomerNoteAction } from "@/lib/actions/customers";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { villasForCustomer } from "@/lib/domain/villa-status";
import { errorMessage } from "@/lib/errors";
import { villaLabel } from "@/lib/domain/villa-label";


type CustomerDraft = { fullName: string; phone: string; email: string; nicPassport: string; address: string };

const emptyCustomer: CustomerDraft = { fullName: "", phone: "", email: "", nicPassport: "", address: "" };
const customerSchema = z.object({ fullName: z.string().trim().min(2, "Customer name must contain at least two characters."), phone: z.string().trim().min(7, "Enter a valid customer phone number."), email: z.email("Enter a valid customer email address."), nicPassport: z.string(), address: z.string() });
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const displayVilla = (villa: Villa) => villaLabel(villa.number);

/**
 * Every status used to render in the same sky-blue pill showing the raw enum value, so
 * "available", "sold" and "cancelled" were visually identical and read as database text.
 */
const villaStatusBadge: Record<Villa["operationalStatus"], string> = {
  available: "bg-surface-muted text-muted-foreground",
  reserved: "bg-sky-100 text-sky-700",
  scheduled: "bg-sky-100 text-sky-700",
  sold: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};
const formatDate = (date: string) => date ? new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`)) : "Due date pending";

function CustomerFormDialog({ customer, onOpenChange, onSaved, open }: { customer?: Customer; onOpenChange: (open: boolean) => void; onSaved: () => void; open: boolean }) {
  const [draft, setDraft] = useState<CustomerDraft>(() => customer ? { fullName: customer.fullName, phone: customer.phone, email: customer.email, nicPassport: customer.nicPassport ?? "", address: customer.address ?? "" } : emptyCustomer);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function update(field: keyof CustomerDraft, value: string) { setDraft((current) => ({ ...current, [field]: value })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSaving(true);
    const parsed = customerSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the customer details."); setSaving(false); return; }
    try { if (customer) await updateCustomerAction(customer.id, parsed.data); else await createCustomerAction(parsed.data); onOpenChange(false); onSaved(); }
    catch (reason) { setError(errorMessage(reason, "Unable to save customer.")); }
    finally { setSaving(false); }
  }
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-8" showClose={false}><div className="flex items-start justify-between gap-5"><div><DialogTitle className="text-2xl font-medium">{customer ? "Edit customer" : "Create customer"}</DialogTitle><DialogDescription className="mt-2">Complete the required information below.</DialogDescription></div><Button aria-label="Close customer form" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><form className="mt-6 space-y-4" onSubmit={submit}>{([['fullName','Customer name*'], ['phone','Mobile number*'], ['email','Email*'], ['nicPassport','NIC / Passport'], ['address','Address']] as const).map(([field, label]) => <label className="block text-sm font-semibold text-muted-foreground" key={field}>{label}<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => update(field, event.target.value)} required={field === 'fullName' || field === 'phone' || field === 'email'} type={field === 'email' ? 'email' : 'text'} value={draft[field]} /></label>)}{error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : customer ? "Save profile" : "Create customer"}</Button></div></form></DialogContent></Dialog>;
}

function CustomerCard({ customer, database }: { customer: Customer; database: MockDatabase }) {
  const villas = villasForCustomer(database.villas, customer.id);
  const outstanding = villas.reduce((total, villa) => total + financials(database, villa).outstanding, 0);
  return <Link className="linked-card group flex min-h-30 min-w-0 items-center gap-4 rounded-lg border bg-surface p-5" href={`/customers/${customer.id}`}><span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-muted text-base font-bold text-primary">{initials(customer.fullName)}</span><div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold">{customer.fullName}</p><p className="mt-1 truncate text-sm text-muted-foreground">{customer.phone} | {customer.email}</p></div><div className="hidden text-right sm:block"><p className="text-xs text-muted-foreground">{villas.length} {villas.length === 1 ? "villa" : "villas"}</p><p className="mt-2 font-semibold">{formatLkr(outstanding)}</p><p className="mt-1 text-xs text-muted-foreground">Outstanding</p></div></Link>;
}

function financials(database: MockDatabase, villa: Villa) {
  const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
  const terms = resolveInterestTerms(database.settings, villa);
  const money = calculateVillaFinancials(schedules, terms, database.today);
  return { value: villa.value, collected: money.principalCollected, outstanding: Math.max(0, villa.value - money.principalCollected), overdue: money.overduePrincipal };
}

function CustomerNotes({ customer, database, onSaved }: { customer: Customer; database: MockDatabase; onSaved: () => void }) {
  const [content, setContent] = useState(""); const [saving, setSaving] = useState(false);
  const notes = database.notes.filter((note) => note.customerId === customer.id && !note.deletedAt);
  const users = new Map(database.users.map((user) => [user.id, user]));
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!content.trim()) return; setSaving(true); try { await addCustomerNoteAction(customer.id, content); setContent(""); onSaved(); } finally { setSaving(false); } }
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]"><section className="rounded-lg border bg-surface p-5 sm:p-7"><h2 className="text-lg font-semibold">Customer notes</h2><div className="mt-6 space-y-6">{notes.length ? notes.map((note) => <article className="border-b pb-6 last:border-0 last:pb-0" key={note.id}><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-surface-muted text-sm font-bold text-primary">{initials(users.get(note.authorId)?.name ?? "Juniper")}</span><div><p className="font-semibold">{users.get(note.authorId)?.name ?? "Juniper user"}</p><p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}</p></div></div><p className="mt-4 text-sm leading-6 text-muted-foreground">{note.content}</p></article>) : <p className="text-sm text-muted-foreground">No customer notes yet.</p>}</div></section><aside className="h-fit rounded-lg border bg-surface p-5 sm:p-6"><h2 className="text-lg font-semibold">Add customer note</h2><p className="mt-1 text-sm text-muted-foreground">Visible only on {customer.fullName}</p><form className="mt-5" onSubmit={save}><textarea className="min-h-40 w-full rounded-md border bg-surface px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setContent(event.target.value)} placeholder="Write a customer update, decision or follow-up..." value={content} /><Button className="mt-4 w-full" disabled={!content.trim() || saving} type="submit"><Plus className="size-4" />{saving ? "Saving..." : "Save note"}</Button></form></aside></div>;
}

/**
 * Where the customer is in their payment schedule, as a horizontal timeline.
 *
 * Each stage is a marker on a connecting line: solid behind the customer's position,
 * dashed ahead of it, so how far through the plan they are reads at a glance rather than
 * having to be counted down a list.
 *
 * The label used to be `completed ? "Completed" : index === 0 ? "Current" : "Upcoming"`,
 * which had three problems: a partly-paid stage was indistinguishable from an untouched
 * one, an overdue stage read "Upcoming" unless it happened to be first, and "Current"
 * stayed pinned to stage 1 even after it was settled. The state now comes from the
 * stage's own status and balance, so it says what is actually true of that installment.
 */
function PaymentScheduleProgress({ schedules }: { schedules: Array<PaymentSchedule & { villa: Villa }> }) {
  // The earliest unsettled stage is the one being collected now — everything after it is
  // genuinely upcoming, whatever its index.
  const currentIndex = schedules.findIndex((schedule) => schedule.principalPaid < schedule.principalAmount);

  return <section className="mt-6 rounded-lg border bg-surface p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Payment schedule progress</h2>
      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{schedules.length} {schedules.length === 1 ? "stage" : "stages"}</span>
    </div>
    {schedules.length
      ? <div className="mt-8 overflow-x-auto pb-2">
          <ol className="flex w-full min-w-max items-start gap-0">{schedules.map((schedule, index) => {
            const completed = schedule.principalPaid >= schedule.principalAmount;
            const partiallyPaid = !completed && schedule.principalPaid > 0;
            const overdue = !completed && schedule.status === "overdue";
            const current = !completed && index === currentIndex;
            const label = completed ? "Completed" : overdue ? "Overdue" : partiallyPaid ? "Partly paid" : current ? "Current" : "Upcoming";
            const reached = completed || current || partiallyPaid || overdue;
            const badgeClass = completed ? "bg-success/10 text-success"
              : overdue ? "bg-danger/10 text-danger"
              : partiallyPaid ? "bg-warning/15 text-warning"
              : current ? "bg-primary/10 text-primary"
              : "bg-sky-50 text-sky-700";
            const markerClass = completed ? "border-success bg-success text-white"
              : overdue ? "border-danger bg-danger text-white"
              : current || partiallyPaid ? "border-primary bg-primary text-white"
              : "border-border bg-surface-muted text-muted-foreground";
            // The line to the LEFT of this marker: solid once the customer has reached
            // this point, dashed for the part of the plan still ahead of them.
            const connector = index === 0 ? null
              : <span aria-hidden="true" className={`mt-5 h-px min-w-8 flex-1 ${reached ? "bg-foreground" : "border-t border-dashed border-border"}`} />;
            return <li className={`flex min-w-0 items-start ${index === 0 ? "" : "flex-1"}`} key={schedule.id}>
              {connector}
              <div className="flex w-32 shrink-0 flex-col items-center px-2 text-center sm:w-36">
                <span className={`grid size-10 place-items-center rounded-full border ${markerClass}`}>
                  {completed ? <Check className="size-5" /> : reached ? <Home className="size-4" /> : <Lock className="size-4" />}
                </span>
                <p className={`mt-3 break-words text-sm font-semibold leading-5 ${reached ? "" : "text-muted-foreground"}`}>{schedule.stage}</p>
                <p className="mt-1 text-xs text-muted-foreground">{completed ? formatDate(schedule.dueDate) : `Due ${formatDate(schedule.dueDate)}`}</p>
                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>{label}</span>
                {/*
                  A partial payment is the case the old view hid completely: money HAS
                  arrived against this stage, and staff settling the rest need to see how
                  much rather than re-deriving it from the Collections table.
                */}
                {partiallyPaid && <p className="mt-2 text-xs font-medium text-muted-foreground">{formatLkr(schedule.principalPaid)} paid<br /><span className="text-danger">{formatLkr(schedule.principalAmount - schedule.principalPaid)} due</span></p>}
              </div>
            </li>;
          })}</ol>
        </div>
      : <p className="mt-6 text-sm text-muted-foreground">No payment stages are available yet.</p>}
  </section>;
}



/**
 * `customer` is the full record (identity document, address) for the profile being viewed,
 * fetched server-side by the page. `database.customers` carries only `CustomerSummary`, so
 * those fields are not shipped to every other page — see `CustomerSummary`.
 */
export function CustomersPageClient({ customer, customerId, database }: { customer?: Customer | null; customerId?: string; database: MockDatabase }) {
  return (
    <AppShell active="Customers">
      <CustomersPageBody customer={customer} customerId={customerId} database={database} />
    </AppShell>
  );
}

/** Split so `useToast()` resolves under AppShell's provider — see ProjectsPageBody. */
function CustomersPageBody({ customer: fullCustomer, customerId, database }: { customer?: Customer | null; customerId?: string; database: MockDatabase }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false); const [editOpen, setEditOpen] = useState(false); const [collectionOpen, setCollectionOpen] = useState(false); const [tab, setTab] = useState<"overview" | "note">("overview");
  const [customersPageSize, setCustomersPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const customersPage = usePagination(database.customers, customersPageSize);
  const { toast } = useToast();
  const refresh = (message?: string) => { router.refresh(); if (message) toast(message); };
  // Prefer the full record the page fetched; fall back to the summary for the list view.
  const customer = fullCustomer ?? database.customers.find((candidate) => candidate.id === customerId) ?? null;
  const customerVillas = useMemo(() => customer ? villasForCustomer(database.villas, customer.id) : [], [database, customer]);
  if (customerId && !customer) return <p className="text-sm text-muted-foreground">Customer not found.</p>;
  if (!customer) return <><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold">Customers</h1><p className="mt-2 text-muted-foreground">Understand every customer relationship at a glance.</p></div><Button onClick={() => setCreateOpen(true)} variant="outline">New customer <Plus className="size-4" /></Button></div><div className="mt-8 grid gap-4 xl:grid-cols-2">{customersPage.visible.map((candidate) => <CustomerCard customer={candidate} database={database} key={candidate.id} />)}</div><Pagination label="customers" onPageChange={customersPage.setPage} onPageSizeChange={setCustomersPageSize} page={customersPage.page} pageCount={customersPage.pageCount} pageSize={customersPageSize} total={database.customers.length} /><CustomerFormDialog key={`create-${createOpen}`} onOpenChange={setCreateOpen} onSaved={() => void refresh("Customer created successfully.")} open={createOpen} /></>;
  const totals = customerVillas.reduce((sum, villa) => { const current = financials(database, villa); return { value: sum.value + current.value, collected: sum.collected + current.collected, outstanding: sum.outstanding + current.outstanding, overdue: sum.overdue + current.overdue }; }, { value: 0, collected: 0, outstanding: 0, overdue: 0 });
  const progressSchedules = customerVillas.flatMap((villa) => database.schedules.filter((schedule) => schedule.villaId === villa.id).map((schedule) => ({ ...schedule, villa }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return <><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><Link className="text-sm font-semibold hover:text-muted-foreground" href="/customers">← All customers</Link><div className="flex flex-wrap gap-3"><Button disabled={!customerVillas.length} onClick={() => setCollectionOpen(true)} variant="outline">Add collection <Plus className="size-4" /></Button><Button onClick={() => setEditOpen(true)} variant="outline">Edit profile <Pencil className="size-4" /></Button></div></div><section className="mt-6 flex items-center gap-5 rounded-lg bg-primary px-6 py-7 text-primary-foreground"><span className="grid size-20 shrink-0 place-items-center rounded-full bg-surface-muted text-xl font-bold text-primary">{initials(customer.fullName)}</span><div className="min-w-0"><h1 className="truncate text-2xl font-semibold">{customer.fullName}</h1><p className="mt-1 break-words text-sm text-primary-foreground/80">{customer.phone} | {customer.email}</p>{(fullCustomer?.nicPassport || fullCustomer?.address) && <p className="mt-1 text-sm text-primary-foreground/70">{[fullCustomer.nicPassport, fullCustomer.address].filter(Boolean).join(" · ")}</p>}</div></section><div className="mt-6 flex gap-3"><Button onClick={() => setTab("overview")} size="sm" variant={tab === "overview" ? "default" : "outline"}>Overview</Button><Button onClick={() => setTab("note")} size="sm" variant={tab === "note" ? "default" : "outline"}>Note</Button></div>{tab === "note" ? <div className="mt-6"><CustomerNotes customer={customer} database={database} onSaved={() => void refresh("Customer note saved successfully.")} /></div> : <><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total property value", totals.value, ""], ["Collected", totals.collected, ""], ["Outstanding", totals.outstanding, ""], ["Overdue", totals.overdue, "text-danger"]].map(([label, value, style]) => <div className="rounded-lg border bg-surface p-5" key={String(label)}><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-3 text-xl font-semibold ${style}`}>{formatLkr(Number(value))}</p></div>)}</div><PaymentScheduleProgress schedules={progressSchedules} /><section className="mt-6 grid gap-4 lg:grid-cols-2">{customerVillas.map((villa) => { const current = financials(database, villa); const next = database.schedules.filter((schedule) => schedule.villaId === villa.id && schedule.principalPaid < schedule.principalAmount).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]; const project = database.projects.find((candidate) => candidate.id === villa.projectId); return <Link className="linked-card group block rounded-lg border bg-surface p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/projects/${villa.projectId}/villas/${villa.id}`} key={villa.id}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold group-hover:underline">{displayVilla(villa)}</h2><p className="mt-1 text-sm text-muted-foreground">{project?.name}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${villaStatusBadge[villa.operationalStatus]}`}>{villaStatusLabels[villa.operationalStatus]}</span></div><dl className="mt-5 divide-y text-sm"><div className="flex justify-between py-3"><dt className="text-muted-foreground">Villa value</dt><dd className="font-semibold">{formatLkr(current.value)}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Collected</dt><dd className="font-semibold">{formatLkr(current.collected)}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Outstanding</dt><dd className="font-semibold">{formatLkr(current.outstanding)}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Next payment</dt><dd className="font-semibold">{next ? formatDate(next.dueDate) : "Complete"}</dd></div></dl></Link>; })}</section></>}<CustomerFormDialog customer={fullCustomer ?? undefined} key={`edit-${customer.id}-${editOpen}`} onOpenChange={setEditOpen} onSaved={() => void refresh("Customer profile updated successfully.")} open={editOpen} />{collectionOpen && customerVillas[0] && <RecordPaymentDialog customer={customer} database={database} key={`collection-${customer.id}-${collectionOpen}`} onClose={() => setCollectionOpen(false)} onSuccess={(message) => { setCollectionOpen(false); void refresh(message); }} villa={customerVillas[0]} />}</>;
}
