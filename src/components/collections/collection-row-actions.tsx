"use client";

import { Bell, Home, Pencil, Plus, Receipt as ReceiptIcon, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ReceiptDialog } from "@/components/collections/receipt-dialog";
import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MockDatabase } from "@/lib/domain/types";
import type { CollectionRow } from "@/lib/domain/collection-rows";
import { calculateVillaFinancials } from "@/lib/finance/calculations";
import { renderReminderText } from "@/lib/reminders/tokens";
import { createReminderApprovalAction } from "@/lib/actions/reminders";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { errorMessage } from "@/lib/errors";
import { useCurrentUser } from "@/components/auth/current-user-provider";


const reminderSchema = z.object({ templateId: z.string().min(1, "Select a reminder template."), sendDate: z.string().min(1, "Select a proposed send date."), subject: z.string().trim().min(1, "Enter a reminder subject."), message: z.string().trim().min(1, "Enter a reminder message."), attachmentUrl: z.union([z.literal(""), z.string().trim().url("Enter a valid document link, or leave it empty.")]) });

type DialogState = "reminder" | "payment" | "edit" | "receipt" | null;
const templateText = renderReminderText;

/**
 * The action menu for one Collections row.
 *
 * The PRD splits these by state — a paid collection offers View Receipt, an
 * "unpaid/scheduled payment" offers Send Reminder and Record Payment — so the menu is
 * built from `row.kind` rather than showing every action on every row.
 */
export function CollectionRowActions({ database, row }: { database: MockDatabase; row: CollectionRow }) {
  const collection = row.collection;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  // C1/E10: Super Admin and Editor may correct a collection. Staff may record but not edit.
  const role = useCurrentUser()?.role ?? "view_only";
  const canEdit = role === "super_admin" || role === "editor";
  const { toast } = useToast();
  const customer = database.customers.find((candidate) => candidate.id === row.customerId);
  const villa = database.villas.find((candidate) => candidate.id === row.villaId);
  const project = database.projects.find((candidate) => candidate.id === row.projectId);
  const schedules = database.schedules.filter((schedule) => schedule.villaId === row.villaId);
  // Receipts come from `v_receipts`; a superseded collection has none, so this is the
  // same condition as "is this a live, confirmed payment".
  const receipt = collection ? database.receipts.find((candidate) => candidate.collectionId === collection.id) : undefined;
  const terms = resolveInterestTerms(database.settings, villa);
  const financials = calculateVillaFinancials(schedules, terms, database.today);
  const nextPaymentDueDate = schedules.filter((schedule) => schedule.principalPaid < schedule.principalAmount).sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0]?.dueDate ?? "Payment due date";
  const villaName = villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Villa";
  if (!customer || !villa || !project) return null;
  return <div className="relative inline-flex justify-end"><Button aria-expanded={menuOpen} aria-haspopup="menu" aria-label={`Actions for ${villaName}`} onClick={() => setMenuOpen((open) => !open)} size="icon" variant="ghost"><span className="text-xl leading-none">⋮</span></Button>{menuOpen && <div className="absolute right-0 top-11 z-30 w-56 rounded-lg border bg-surface p-2 shadow-xl" role="menu">{row.kind === "installment" && <><Button className="w-full justify-start" onClick={() => { setDialog("reminder"); setMenuOpen(false); }} variant="ghost"><Bell className="size-4" />Prepare reminder</Button><Button className="w-full justify-start" onClick={() => { setDialog("payment"); setMenuOpen(false); }} variant="ghost"><Plus className="size-4" />Record payment</Button></>}{canEdit && collection?.status === "confirmed" && <Button className="w-full justify-start" onClick={() => { setDialog("edit"); setMenuOpen(false); }} variant="ghost"><Pencil className="size-4" />Edit collection</Button>}{receipt && <Button className="w-full justify-start" onClick={() => { setDialog("receipt"); setMenuOpen(false); }} variant="ghost"><ReceiptIcon className="size-4" />View receipt</Button>}<Button asChild className="w-full justify-start" variant="ghost"><a href={`/projects/${villa.projectId}/villas/${villa.id}`}><Home className="size-4" />View villa</a></Button></div>}{dialog === "reminder" && <PrepareReminderDialog amount={financials.outstandingPrincipal + financials.interestOutstanding} companyName={database.settings.companyName} customerName={customer.fullName} database={database} dueDate={nextPaymentDueDate} onClose={() => setDialog(null)} onSuccess={(message) => { setDialog(null); toast(message); }} projectName={project.name} villa={villa} villaName={villaName} />}{dialog === "payment" && <RecordPaymentDialog customer={customer} database={database} onClose={() => setDialog(null)} onSuccess={(message) => { setDialog(null); toast(message); }} villa={villa} />}{dialog === "receipt" && receipt && collection && <ReceiptDialog collection={collection} customer={customer} database={database} onClose={() => setDialog(null)} project={project} receipt={receipt} villa={villa} />}{dialog === "edit" && collection && <RecordPaymentDialog customer={customer} database={database} editing={collection} onClose={() => setDialog(null)} onSuccess={(message) => { setDialog(null); toast(message); }} villa={villa} />}</div>;
}

function PrepareReminderDialog({ amount, companyName, customerName, database, dueDate, onClose, onSuccess, projectName, villa, villaName }: { amount: number; companyName: string; customerName: string; database: MockDatabase; dueDate: string; onClose: () => void; onSuccess: (message: string) => void; projectName: string; villa: { id: string; customerId: string | null }; villaName: string }) {
  const defaultTemplate = database.reminderTemplates.find((template) => template.type === "overdue" && template.isActive) ?? database.reminderTemplates.find((template) => template.isActive);
  const fields = { amount, companyName, customerName, dueDate, villaName };
  const [form, setForm] = useState(() => ({ templateId: defaultTemplate?.id ?? "", sendDate: database.today, subject: defaultTemplate ? templateText(defaultTemplate.subject, fields) : "", message: defaultTemplate ? templateText(defaultTemplate.message, fields) : "", attachmentUrl: "" }));
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const activeTemplates = database.reminderTemplates.filter((template) => template.isActive);
  function selectTemplate(templateId: string) { const template = activeTemplates.find((candidate) => candidate.id === templateId); if (!template) return; setForm((current) => ({ ...current, templateId, subject: templateText(template.subject, fields), message: templateText(template.message, fields) })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = reminderSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the reminder details."); return; } setSaving(true); setError(""); try { await createReminderApprovalAction({ customerId: villa.customerId!, villaId: villa.id, ...parsed.data }); onSuccess("Reminder submitted for approval successfully."); } catch (reason) { setError(errorMessage(reason, "Unable to submit the reminder.")); } finally { setSaving(false); } }
  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Bell className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-2xl font-medium">Prepare payment reminder</DialogTitle><DialogDescription className="mt-1">{villaName} · {projectName}</DialogDescription></div><Button aria-label="Close reminder form" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><section className="mt-6 flex items-center gap-4 rounded-lg bg-surface-subtle p-4"><span className="grid size-12 place-items-center rounded-full bg-surface-muted font-bold text-primary">{customerName.split(" ").map((name) => name[0]).join("").slice(0, 2)}</span><div><p className="text-xs text-muted-foreground">Email recipient</p><p className="mt-1 font-semibold">{customerName}</p></div></section><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Reminder template<Select onValueChange={selectTemplate} value={form.templateId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select template" /></SelectTrigger><SelectContent>{activeTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></label><label className="text-sm font-semibold text-muted-foreground">Proposed send date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, sendDate: event.target.value })} type="date" value={form.sendDate} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Subject<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, subject: event.target.value })} value={form.subject} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Message<textarea className="mt-2 min-h-40 w-full rounded-md border bg-surface px-3 py-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, message: event.target.value })} value={form.message} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Supporting document link <span className="font-normal">(optional)</span><input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })} placeholder="https://drive.google.com/..." type="url" value={form.attachmentUrl} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Paste a link to an invoice hosted elsewhere. Files are not uploaded or stored here.</span></label><p className="mt-4 rounded-md bg-success/10 px-4 py-3 text-sm text-success">This reminder enters the approval queue. No email is sent until a Super Admin approves it.</p>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit"><Bell className="size-4" />{saving ? "Submitting..." : "Submit for approval"}</Button></footer></form></DialogContent></Dialog>;
}
