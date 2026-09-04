"use client";

import { Bell, FileUp, Home, Plus, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEMO_TODAY } from "@/lib/config/demo";
import type { Collection, MockDatabase } from "@/lib/domain/types";
import { calculateVillaFinancials } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { getRepository } from "@/lib/repositories";

const repository = getRepository();

const reminderSchema = z.object({ templateId: z.string().min(1, "Select a reminder template."), sendDate: z.string().min(1, "Select a proposed send date."), subject: z.string().trim().min(1, "Enter a reminder subject."), message: z.string().trim().min(1, "Enter a reminder message."), attachmentName: z.string().trim().min(1, "Upload an invoice PDF.") });

type DialogState = "reminder" | "payment" | null;
type Notice = { message: string } | null;

function NoticeAlert({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return notice ? <div className="fixed right-4 top-24 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-success bg-success px-4 py-3 text-sm font-semibold text-white shadow-lg sm:right-8"><span>{notice.message}</span><Button aria-label="Dismiss notification" className="text-white hover:bg-white/15 hover:text-white" onClick={onDismiss} size="icon" variant="ghost"><X className="size-4" /></Button></div> : null;
}

function templateText(value: string, fields: { amount: number; companyName: string; customerName: string; dueDate: string; villaName: string }) {
  const replacements: Array<[string, string]> = [
    ["customer_name", fields.customerName],
    ["villa_name", fields.villaName],
    ["villa_number", fields.villaName],
    ["outstanding_amount", formatLkr(fields.amount)],
    ["amount", formatLkr(fields.amount)],
    ["due_date", fields.dueDate],
    ["company_name", fields.companyName],
  ];
  return replacements.reduce((text, [token, replacement]) => text.replaceAll(`{{${token}}}`, replacement).replaceAll(`{${token}}`, replacement), value);
}

export function CollectionRowActions({ collection, database }: { collection: Collection; database: MockDatabase }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const customer = database.customers.find((candidate) => candidate.id === collection.customerId);
  const villa = database.villas.find((candidate) => candidate.id === collection.villaId);
  const project = database.projects.find((candidate) => candidate.id === collection.projectId);
  const schedules = database.schedules.filter((schedule) => schedule.villaId === collection.villaId);
  const terms = { ...database.settings.defaultInterestTerms, ...villa?.interestTerms, ...(villa?.chargeLatePaymentInterest === false ? { monthlyRate: 0 } : {}) };
  const financials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
  const nextPaymentDueDate = schedules.filter((schedule) => schedule.principalPaid < schedule.principalAmount).sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0]?.dueDate ?? "Payment due date";
  const villaName = villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Villa";
  if (!customer || !villa || !project) return null;
  return <div className="relative inline-flex justify-end"><NoticeAlert notice={notice} onDismiss={() => setNotice(null)} /><Button aria-expanded={menuOpen} aria-haspopup="menu" aria-label={`Actions for ${villaName}`} onClick={() => setMenuOpen((open) => !open)} size="icon" variant="ghost"><span className="text-xl leading-none">⋮</span></Button>{menuOpen && <div className="absolute right-0 top-11 z-30 w-56 rounded-lg border bg-surface p-2 shadow-xl" role="menu"><Button className="w-full justify-start" onClick={() => { setDialog("reminder"); setMenuOpen(false); }} variant="ghost"><Bell className="size-4" />Prepare reminder</Button><Button className="w-full justify-start" onClick={() => { setDialog("payment"); setMenuOpen(false); }} variant="ghost"><Plus className="size-4" />Record payment</Button><Button asChild className="w-full justify-start" variant="ghost"><a href={`/projects/${villa.projectId}/villas/${villa.id}`}><Home className="size-4" />View villa</a></Button></div>}{dialog === "reminder" && <PrepareReminderDialog amount={financials.outstandingPrincipal + financials.interestOutstanding} companyName={database.settings.companyName} customerName={customer.fullName} database={database} dueDate={nextPaymentDueDate} onClose={() => setDialog(null)} onSuccess={(message) => { setDialog(null); setNotice({ message }); }} projectName={project.name} villa={villa} villaName={villaName} />}{dialog === "payment" && <RecordPaymentDialog customer={customer} database={database} onClose={() => setDialog(null)} onSuccess={(message) => { setDialog(null); setNotice({ message }); }} villa={villa} />}</div>;
}

function PrepareReminderDialog({ amount, companyName, customerName, database, dueDate, onClose, onSuccess, projectName, villa, villaName }: { amount: number; companyName: string; customerName: string; database: MockDatabase; dueDate: string; onClose: () => void; onSuccess: (message: string) => void; projectName: string; villa: { id: string; customerId: string | null }; villaName: string }) {
  const defaultTemplate = database.reminderTemplates.find((template) => template.type === "overdue" && template.isActive) ?? database.reminderTemplates.find((template) => template.isActive);
  const fields = { amount, companyName, customerName, dueDate, villaName };
  const [form, setForm] = useState(() => ({ templateId: defaultTemplate?.id ?? "", sendDate: DEMO_TODAY, subject: defaultTemplate ? templateText(defaultTemplate.subject, fields) : "", message: defaultTemplate ? templateText(defaultTemplate.message, fields) : "", attachmentName: "" }));
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const activeTemplates = database.reminderTemplates.filter((template) => template.isActive);
  function selectTemplate(templateId: string) { const template = activeTemplates.find((candidate) => candidate.id === templateId); if (!template) return; setForm((current) => ({ ...current, templateId, subject: templateText(template.subject, fields), message: templateText(template.message, fields) })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = reminderSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the reminder details."); return; } setSaving(true); setError(""); try { await repository.createReminderApproval({ customerId: villa.customerId!, villaId: villa.id, ...parsed.data }); onSuccess("Reminder submitted for approval successfully."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to submit the reminder."); } finally { setSaving(false); } }
  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Bell className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-2xl font-medium">Prepare payment reminder</DialogTitle><DialogDescription className="mt-1">{villaName} · {projectName}</DialogDescription></div><Button aria-label="Close reminder form" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><section className="mt-6 flex items-center gap-4 rounded-lg bg-surface-subtle p-4"><span className="grid size-12 place-items-center rounded-full bg-surface-muted font-bold text-primary">{customerName.split(" ").map((name) => name[0]).join("").slice(0, 2)}</span><div><p className="text-xs text-muted-foreground">Email recipient</p><p className="mt-1 font-semibold">{customerName}</p></div></section><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Reminder template<select className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => selectTemplate(event.target.value)} value={form.templateId}><option value="">Select template</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="text-sm font-semibold text-muted-foreground">Proposed send date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, sendDate: event.target.value })} type="date" value={form.sendDate} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Subject<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, subject: event.target.value })} value={form.subject} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Message<textarea className="mt-2 min-h-40 w-full rounded-md border bg-surface px-3 py-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, message: event.target.value })} value={form.message} /></label><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-surface p-4 text-sm font-semibold"><FileUp className="size-5 text-primary" /><span className="min-w-0 flex-1 truncate">{form.attachmentName || "Upload invoice PDF"}</span><input accept="application/pdf" className="sr-only" onChange={(event) => setForm({ ...form, attachmentName: event.target.files?.[0]?.name ?? "" })} type="file" /></label><p className="mt-4 rounded-md bg-success/10 px-4 py-3 text-sm text-success">This reminder enters the approval queue. No email is sent until a Super Admin approves it.</p>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit"><Bell className="size-4" />{saving ? "Submitting..." : "Submit for approval"}</Button></footer></form></DialogContent></Dialog>;
}
