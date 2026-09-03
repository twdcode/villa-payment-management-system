"use client";

import { AlertTriangle, ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, FileText, Home, Info, Pencil, Plus, ShieldAlert, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PAYMENT_SCHEDULE_STAGES } from "@/lib/config/demo";
import type { InterestTerms, MockDatabase, PaymentSchedule, PaymentStatus, Villa } from "@/lib/domain/types";
import { paymentStatusLabels, villaStatusLabels } from "@/lib/domain/status-labels";
import { formatLkr } from "@/lib/formatters";
import { isPaymentScheduleReady } from "@/lib/finance/calculations";
import { deriveVillaSummaries, type VillaSummary } from "@/lib/projects/villa-summary";
import { can } from "@/lib/permissions/roles";
import type { PaymentScheduleUpdateInput } from "@/lib/repositories/contracts";
import { mockRepository } from "@/lib/repositories/local-storage-repository";

const documentLinkSchema = z.object({
  name: z.string().trim().min(1, "Enter a document name."),
  date: z.string().min(1, "Select a document date."),
  url: z.url("Enter a valid document link."),
});

const paymentStatusStyles: Record<PaymentStatus, string> = {
  paid: "bg-success/10 text-success",
  partially_paid: "bg-warning/15 text-warning",
  due: "bg-sky-100 text-sky-700",
  overdue: "bg-danger/10 text-danger",
  not_due: "bg-surface-muted text-muted-foreground",
};

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${paymentStatusStyles[status]}`}>{paymentStatusLabels[status]}</span>;
}

function scheduleIsComplete(schedules: PaymentSchedule[], villaValue: number) {
  return schedules.length > 0 && Math.abs(schedules.reduce((total, schedule) => total + schedule.principalAmount, 0) - villaValue) < 0.01 && schedules.every(isPaymentScheduleReady);
}

function formatScheduleDate(date: string) {
  return date ? new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`)) : "Due date pending";
}

type ScheduleDraft = PaymentScheduleUpdateInput & { clientId: string; principalPaid: number };

function scheduleDrafts(schedules: PaymentSchedule[], gracePeriodDays: number): ScheduleDraft[] {
  return schedules.length
    ? schedules.map((schedule) => ({ id: schedule.id, clientId: schedule.id, stage: schedule.stage, deliverables: schedule.deliverables ?? "", dueDate: schedule.dueDate, principalAmount: schedule.principalAmount, gracePeriodDays: schedule.gracePeriodDays, principalPaid: schedule.principalPaid }))
    : DEFAULT_PAYMENT_SCHEDULE_STAGES.map((stage) => ({ clientId: crypto.randomUUID(), stage, deliverables: "", dueDate: "", principalAmount: 0, gracePeriodDays, principalPaid: 0 }));
}

function PaymentScheduleDialog({ onOpenChange, onSaved, open, schedules, villa }: { onOpenChange: (open: boolean) => void; onSaved: () => void; open: boolean; schedules: PaymentSchedule[]; villa: Villa }) {
  const [drafts, setDrafts] = useState<ScheduleDraft[]>(() => scheduleDrafts(schedules, villa.interestTerms?.gracePeriodDays ?? 30));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const total = drafts.reduce((sum, draft) => sum + draft.principalAmount, 0);
  const difference = villa.value - total;

  function updateDraft(clientId: string, patch: Partial<ScheduleDraft>) {
    setDrafts((current) => current.map((draft) => draft.clientId === clientId ? { ...draft, ...patch } : draft));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await mockRepository.updatePaymentSchedule(villa.id, drafts.map((draft) => ({ id: draft.id, stage: draft.stage, deliverables: draft.deliverables, dueDate: draft.dueDate, principalAmount: draft.principalAmount, gracePeriodDays: draft.gracePeriodDays })));
      onOpenChange(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update payment schedule.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[90rem] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-[calc(100%-2rem)]" showClose={false}>
      <div className="shrink-0 border-b bg-surface px-5 py-5 sm:px-7 sm:py-6"><div className="flex items-start justify-between gap-5"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><CalendarDays className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium sm:text-2xl">Update payment schedule</DialogTitle><DialogDescription className="mt-1 text-sm text-muted-foreground">Villa {villa.number.replace(/^[A-Z]+-/, "")} · Edit stages, due dates, amounts and construction deliverables.</DialogDescription></div><Button aria-label="Close payment schedule editor" className="shrink-0" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div>
        <dl className="mt-5 grid gap-3 rounded-lg bg-surface-subtle p-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Villa value</dt><dd className="mt-1 text-sm font-semibold">{formatLkr(villa.value)}</dd></div><div><dt className="text-xs text-muted-foreground">Schedule total</dt><dd className="mt-1 text-sm font-semibold">{formatLkr(total)}</dd></div><div><dt className="text-xs text-muted-foreground">Difference</dt><dd className={`mt-1 text-sm font-semibold ${difference === 0 ? "" : "text-danger"}`}>{formatLkr(Math.abs(difference))}{difference === 0 ? "" : difference > 0 ? " remaining" : " over"}</dd></div></dl>
      </div>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="space-y-4">{drafts.map((draft, index) => <section className="rounded-lg border bg-surface p-4 sm:p-5" key={draft.clientId}><div className="flex items-center justify-between gap-4"><h3 className="text-sm font-semibold">{index + 1}. {draft.stage || "Payment stage"}</h3><Button className="h-auto px-0 py-1 text-xs text-danger hover:bg-transparent hover:text-danger" disabled={draft.principalPaid > 0 || drafts.length === 1} onClick={() => setDrafts((current) => current.filter((candidate) => candidate.clientId !== draft.clientId))} type="button" variant="ghost">Remove</Button></div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold text-muted-foreground">Stage name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { stage: event.target.value })} value={draft.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Due date<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { dueDate: event.target.value })} type="date" value={draft.dueDate} /></label><label className="text-sm font-semibold text-muted-foreground">Amount<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" min={draft.principalPaid} onChange={(event) => updateDraft(draft.clientId, { principalAmount: Number(event.target.value) })} type="number" value={draft.principalAmount || ""} /></label><div className="text-sm font-semibold text-muted-foreground">Paid to date<div className="mt-2 flex h-11 items-center rounded-md border bg-surface-muted px-3 text-sm text-muted-foreground">{formatLkr(draft.principalPaid)}</div></div></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Stage deliverables<textarea className="mt-2 min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { deliverables: event.target.value })} placeholder="Construction work or documents delivered at this stage..." value={draft.deliverables ?? ""} /></label></section>)}</div><Button className="mt-5 w-full border-dashed sm:w-auto" onClick={() => setDrafts((current) => [...current, { clientId: crypto.randomUUID(), stage: "", deliverables: "", dueDate: "", principalAmount: 0, gracePeriodDays: villa.interestTerms?.gracePeriodDays ?? 30, principalPaid: 0 }])} type="button" variant="outline"><Plus className="size-4" />Add payment stage</Button></div><footer className="shrink-0 border-t bg-surface px-5 py-4 sm:px-7"><p className="mb-3 text-sm text-muted-foreground">Incomplete schedules can be saved and finished later. They cannot be used for collections until every stage is complete.</p>{error && <p className="mb-3 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}<div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save schedule"}</Button></div></footer></form>
    </DialogContent>
  </Dialog>;
}

function InterestTermsDialog({ onOpenChange, onSaved, open, terms: initialTerms, villa }: { onOpenChange: (open: boolean) => void; onSaved: () => void; open: boolean; terms: InterestTerms; villa: Villa }) {
  const [chargeLatePaymentInterest, setChargeLatePaymentInterest] = useState(villa.chargeLatePaymentInterest ?? true);
  const [terms, setTerms] = useState(initialTerms);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !chargeLatePaymentInterest;

  function updateTerms(patch: Partial<InterestTerms>) {
    setTerms((current) => ({ ...current, ...patch }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await mockRepository.updateVillaInterestTerms(villa.id, { chargeLatePaymentInterest, interestTerms: terms });
      onOpenChange(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update interest terms.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-[calc(100%-2rem)]" showClose={false}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-5"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Clock3 className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium sm:text-2xl">Update interest terms</DialogTitle><DialogDescription className="mt-1 text-sm text-muted-foreground">Villa {villa.number.replace(/^[A-Z]+-/, "")} · S&amp;P late-payment settings</DialogDescription></div><Button aria-label="Close interest terms editor" className="shrink-0" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-lg bg-surface-subtle p-4 text-sm font-semibold"><input checked={chargeLatePaymentInterest} className="size-5 rounded border accent-primary" onChange={(event) => setChargeLatePaymentInterest(event.target.checked)} type="checkbox" />Charge late-payment interest</label>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={disabled}>
            <label className="text-sm font-semibold text-muted-foreground">Monthly rate (%)<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ monthlyRate: Number(event.target.value) / 100 })} step="0.1" type="number" value={(terms.monthlyRate * 100).toString()} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Grace period (days)<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ gracePeriodDays: Number(event.target.value) })} type="number" value={terms.gracePeriodDays} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Pro-rata day divisor<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="1" onChange={(event) => updateTerms({ proRataDivisor: Number(event.target.value) })} type="number" value={terms.proRataDivisor} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Interest start<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" onChange={(event) => updateTerms({ interestStart: event.target.value as InterestTerms["interestStart"] })} value={terms.interestStart}><option value="after_grace">After grace period</option><option value="from_due_date">From due date</option></select></label>
            <label className="text-sm font-semibold text-muted-foreground">First reminder day<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ reminderDaysAfterDue: Number(event.target.value) })} type="number" value={terms.reminderDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Second reminder day<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ secondReminderDaysAfterDue: Number(event.target.value) })} type="number" value={terms.secondReminderDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Final notice day<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ finalNoticeDaysAfterDue: Number(event.target.value) })} type="number" value={terms.finalNoticeDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Collection allocation<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" onChange={(event) => updateTerms({ allocationOrder: event.target.value as InterestTerms["allocationOrder"] })} value={terms.allocationOrder}><option value="interest_first">Interest first</option><option value="principal_first">Principal first</option></select></label>
          </fieldset>
          <section className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning"><p className="font-semibold">Legal confirmation</p><p className="mt-1">Choose whether chargeable days start after the grace period or retrospectively from the due date.</p></section>
        </div>
        <footer className="shrink-0 border-t bg-surface px-5 py-4 sm:px-7">{error && <p className="mb-3 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}<div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save terms"}</Button></div></footer>
      </form>
    </DialogContent>
  </Dialog>;
}

function VillaSettingsPanel({ database, onCancelled, onDeleted, villa }: { database: MockDatabase; onCancelled: () => void; onDeleted: () => void; villa: Villa }) {
  const [action, setAction] = useState<"cancel" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hasFinancialHistory = database.collections.some((collection) => collection.villaId === villa.id);
  const isCancellation = action === "cancel";

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setError("");
    setSaving(true);
    try {
      if (action === "cancel") {
        await mockRepository.cancelVilla(villa.id, reason);
        setAction(null);
        onCancelled();
      } else {
        await mockRepository.deleteVillaPermanently(villa.id, reason);
        setAction(null);
        onDeleted();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this villa programme.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setAction(null);
    setReason("");
    setError("");
  }

  return <section className="mt-6 space-y-5"><div className="rounded-2xl border bg-surface p-6 sm:p-7"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-xl bg-primary text-primary-foreground"><ShieldAlert className="size-7" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Super Admin only</p><h2 className="mt-2 text-xl font-semibold">Villa settings</h2><p className="mt-1 text-sm text-muted-foreground">Control this villa programme without losing important customer and payment history.</p></div></div></div><div className="rounded-2xl border bg-surface p-6 sm:p-7"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-success/10 text-success"><CheckCircle2 className="size-6" /></span><div><p className="text-xs font-semibold text-muted-foreground">Current programme status</p><h3 className="mt-1 text-lg font-semibold">{villa.operationalStatus === "cancelled" ? "Cancelled" : "Active"}</h3><p className="mt-1 text-sm text-muted-foreground">{villa.operationalStatus === "cancelled" ? "Collections, schedules, interest, and reminders are disabled for this villa." : "Collections, schedules, interest, and reminders are currently enabled for this villa."}</p></div></div></div><div className="rounded-2xl border border-warning/40 bg-warning/5 p-6 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">Programme control</p><div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xl font-semibold">Cancel villa programme</h3><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use cancellation when an agreement stops but its customer, receipt, and activity history must remain available.</p><ul className="mt-4 space-y-2 text-sm text-muted-foreground"><li>Requires a cancellation reason</li><li>Stops new collections, schedule changes, interest actions and reminders</li><li>Removes the villa from active dashboard totals</li><li>Keeps receipts, documents, notes and audit information</li></ul></div><Button disabled={villa.operationalStatus === "cancelled"} onClick={() => setAction("cancel")} variant="outline">Cancel villa programme</Button></div></div><div className="rounded-2xl border border-danger/35 bg-danger/5 p-6 sm:p-7"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">Danger zone</p><div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xl font-semibold">Permanently delete villa</h3><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Permanent deletion is intended only for duplicate or mistakenly created villas. This action cannot be undone.</p>{hasFinancialHistory && <p className="mt-4 flex items-center gap-2 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger"><AlertTriangle className="size-5 shrink-0" />Unavailable because this villa has financial history. Cancel the programme instead to preserve records.</p>}</div><Button disabled={hasFinancialHistory} onClick={() => setAction("delete")} variant="destructive">Delete permanently</Button></div></div>
    {action && <Dialog onOpenChange={(open) => { if (!open) close(); }} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={confirm}><div className="flex items-start justify-between gap-4"><div><span className={`grid size-11 place-items-center rounded-md ${isCancellation ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger"}`}>{isCancellation ? <AlertTriangle className="size-5" /> : <ShieldAlert className="size-5" />}</span><DialogTitle className="mt-5 text-xl font-medium sm:text-2xl">{isCancellation ? `Cancel Villa ${villa.number} programme?` : `Permanently delete Villa ${villa.number}?`}</DialogTitle><DialogDescription className="mt-2 text-sm text-muted-foreground">{isCancellation ? "This disables future financial activity but keeps the villa and its complete history available." : "This removes the villa and its non-financial records. This action cannot be undone."}</DialogDescription></div><Button aria-label="Close confirmation" onClick={close} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><section className="mt-6 rounded-lg border bg-surface-subtle p-4 text-sm text-muted-foreground"><p className="flex items-center gap-3"><CheckCircle2 className="size-5 shrink-0 text-success" />{isCancellation ? "Receipts and payment history remain available" : "Only villas without financial history can be deleted"}</p><p className="mt-3 flex items-center gap-3"><CheckCircle2 className="size-5 shrink-0 text-success" />{isCancellation ? "Documents and notes remain available" : "A deletion reason is retained in the action audit"}</p><p className="mt-3 flex items-center gap-3"><AlertTriangle className="size-5 shrink-0 text-warning" />{isCancellation ? "New collections and reminders will stop" : "Deleted villas cannot be restored"}</p></section><label className="mt-6 block text-sm font-semibold text-muted-foreground">{isCancellation ? "Reason for cancellation" : "Reason for deletion"}<textarea className="mt-2 min-h-28 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setReason(event.target.value)} placeholder={isCancellation ? "Explain why this villa programme is being cancelled..." : "Explain why this villa must be permanently deleted..."} value={reason} /></label><p className="mt-2 text-sm text-muted-foreground">This reason will be visible in the villa audit history.</p>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}<footer className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={close} type="button" variant="outline">Cancel</Button><Button disabled={reason.trim().length < 3 || saving} type="submit" variant={isCancellation ? "outline" : "destructive"}>{saving ? "Saving..." : isCancellation ? "Cancel villa programme" : "Delete permanently"}</Button></footer></form></DialogContent></Dialog>}
  </section>;
}

function NoteComposer({ currentUser, onSaved, villa }: { currentUser: MockDatabase["users"][number] | undefined; onSaved: () => void; villa: Villa }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canAddNote = currentUser ? can(currentUser.role, "add_notes") : false;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await mockRepository.addVillaNote(villa.id, content);
      setContent("");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this villa note.");
    } finally {
      setSaving(false);
    }
  }

  return <aside className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Add villa note</h2><p className="mt-2 text-sm text-muted-foreground">Visible only on Villa {villa.number.replace(/^[A-Z]+-/, "")}</p><form className="mt-6" onSubmit={save}><label className="text-sm font-semibold text-muted-foreground">Note<textarea className="mt-2 min-h-40 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canAddNote} onChange={(event) => setContent(event.target.value)} placeholder="Write a construction update, decision or villa-specific follow-up..." value={content} /></label>{error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-4 flex items-center gap-3 rounded-lg bg-surface-subtle p-3"><span className="grid size-10 place-items-center rounded-full bg-surface-muted text-sm font-bold text-primary">{currentUser?.name.split(" ").map((part) => part[0]).join("").slice(0, 2) ?? "JV"}</span><div><p className="text-xs text-muted-foreground">Posting as</p><p className="mt-1 text-sm font-semibold">{currentUser?.name ?? "Juniper user"}</p></div></div><Button className="mt-4 w-full" disabled={!canAddNote || content.trim().length === 0 || saving} type="submit"><Plus className="size-4" />{saving ? "Saving..." : "Save note"}</Button></form></aside>;
}

function VillaDocumentsTab({ database, onSaved, villa }: { database: MockDatabase; onSaved: () => void; villa: Villa }) {
  const [form, setForm] = useState({ name: "", date: "", url: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const documents = database.documents.filter((document) => document.villaId === villa.id);
  const currentUser = database.users.find((user) => user.id === "user-vishal") ?? database.users[0];
  const canManageDocuments = currentUser ? can(currentUser.role, "manage_documents") : false;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = documentLinkSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the document details."); return; }
    setError("");
    setSaving(true);
    try {
      await mockRepository.addVillaDocument(villa.id, parsed.data);
      setForm({ name: "", date: "", url: "" });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this document link.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.85fr)]"><div className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Villa documents</h2><p className="mt-2 text-sm text-muted-foreground">Saved links to property documents. Files stay in their original location.</p>{documents.length ? <div className="mt-6 divide-y border-t">{documents.map((document) => <article className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between" key={document.id}><div className="flex min-w-0 items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-muted"><FileText className="size-6 text-primary" /></span><div className="min-w-0"><h3 className="truncate font-semibold">{document.name}</h3><p className="mt-1 text-sm text-muted-foreground">Document date · {formatScheduleDate(document.date)}</p><p className="mt-1 text-xs text-muted-foreground">Added by {database.users.find((user) => user.id === document.createdBy)?.name ?? "Juniper team"} · {new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(document.createdAt))}</p></div></div><a className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:underline" href={document.url} rel="noreferrer" target="_blank">Open link <ArrowLeft className="size-4 rotate-180" /></a></article>)}</div> : <div className="mt-6 grid min-h-56 place-items-center rounded-xl border border-dashed bg-surface-subtle px-6 text-center"><div><FileText className="mx-auto size-8 text-accent" /><p className="mt-3 font-semibold">No villa documents yet</p><p className="mt-1 text-sm text-muted-foreground">Document links will appear here when they are added.</p></div></div>}</div><aside className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Add document link</h2><p className="mt-2 text-sm text-muted-foreground">No upload is needed</p><form className="mt-6" onSubmit={save}><label className="block text-sm font-semibold text-muted-foreground">Document name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sale and Purchase Agreement" value={form.name} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document date<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} type="date" value={form.date} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document link<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://drive.google.com/..." type="url" value={form.url} /></label><p className="mt-4 flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-3 text-xs text-muted-foreground"><CheckCircle2 className="size-5 shrink-0 text-success" />Only the link will be saved. The document is not uploaded to Juniper.</p>{error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}<Button className="mt-4 w-full" disabled={!canManageDocuments || !form.name.trim() || !form.date || !form.url.trim() || saving} type="submit"><Plus className="size-4" />{saving ? "Saving..." : "Save document"}</Button></form></aside></section>;
}

function VillaNotesTab({ database, onSaved, villa }: { database: MockDatabase; onSaved: () => void; villa: Villa }) {
  const notes = database.notes.filter((note) => note.villaId === villa.id && !note.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const currentUser = database.users.find((user) => user.id === "user-vishal") ?? database.users[0];
  const groups = notes.reduce<Record<string, typeof notes>>((result, note) => { const key = note.createdAt.slice(0, 10); (result[key] ??= []).push(note); return result; }, {});

  return <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.85fr)]"><div className="rounded-2xl border bg-surface p-6 sm:p-7">{Object.keys(groups).length ? Object.entries(groups).map(([date, entries]) => <section className="border-t pt-5 first:border-t-0 first:pt-0" key={date}><h2 className="text-lg font-semibold text-muted-foreground">{date.replaceAll("-", "/")}</h2>{entries.map((note) => { const author = database.users.find((user) => user.id === note.authorId); return <article className="mt-5" key={note.id}><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-surface-muted text-sm font-bold text-primary">{author?.name.split(" ").map((part) => part[0]).join("").slice(0, 2) ?? "JV"}</span><div><h3 className="font-semibold">{author?.name ?? "Juniper team"}</h3><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-LK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(note.createdAt))}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{note.content}</p></article>; })}</section>) : <div className="grid min-h-72 place-items-center text-center"><div><FileText className="mx-auto size-8 text-accent" /><p className="mt-3 font-semibold">No villa notes yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first update for this villa.</p></div></div>}</div><NoteComposer currentUser={currentUser} onSaved={onSaved} villa={villa} /></section>;
}

function EmptyVillaProfile({ number, projectId, projectName }: { number: string; projectId: string; projectName: string }) {
  return <>
    <div className="rounded-2xl border bg-surface px-6 py-6 sm:px-8"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-xl bg-surface-muted"><Home className="size-6 text-primary" /></span><div><h1 className="text-2xl font-semibold">Villa {number}</h1><p className="mt-1 text-base text-muted-foreground">{projectName}</p></div></div></div>
    <section className="mt-8 grid min-h-[34rem] place-items-center rounded-[1.5rem] border bg-surface px-6 text-center"><div><span className="mx-auto grid size-28 place-items-center rounded-full bg-surface-subtle"><Building2 className="size-12 text-accent" strokeWidth={1.5} /></span><h2 className="mt-7 text-3xl font-semibold">Villa {number}</h2><p className="mt-5 text-lg font-semibold text-muted-foreground">Set up your villa and track financial data</p><Button asChild className="mt-10" size="lg"><Link href={`/projects/${projectId}/villas/draft-${number}/setup`}>Add Villa Details</Link></Button></div></section>
    <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" href={`/projects/${projectId}`}><ArrowLeft className="size-4" />All villas</Link>
  </>;
}

function MetricCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-2xl border bg-surface p-5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className={`mt-3 text-xl font-semibold ${danger ? "text-danger" : ""}`}>{value}</p></div>;
}

function ConfiguredVillaProfile({ database, onCollectionSaved, onInterestSaved, onScheduleSaved, projectId, projectName, summary }: { database: MockDatabase; onCollectionSaved: (message: string) => void; onInterestSaved: () => void; onScheduleSaved: () => void; projectId: string; projectName: string; summary: VillaSummary }) {
  const { customer, financials, villa } = summary;
  const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
  const collections = database.collections.filter((collection) => collection.villaId === villa.id && collection.status === "confirmed");
  const storedTerms = { ...database.settings.defaultInterestTerms, ...villa.interestTerms };
  const terms = villa.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [interestEditorOpen, setInterestEditorOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const role = database.users.find((user) => user.id === "user-vishal")?.role ?? "super_admin";
  const canEditSchedule = role !== "view_only";
  const canManageVilla = role === "super_admin";
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "notes" | "settings">("overview");
  const [programmeFeedback, setProgrammeFeedback] = useState("");
  const router = useRouter();
  const setupItems = [
    { label: "Villa details", complete: true },
    { label: "Customer assigned", complete: Boolean(customer) },
    { label: "Payment schedule", complete: scheduleIsComplete(schedules, villa.value) },
  ];

  return <>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><Link className="inline-flex items-center gap-2 text-sm font-semibold hover:text-muted-foreground" href={`/projects/${projectId}`}><ArrowLeft className="size-4" />All villas</Link><div className="flex flex-wrap gap-3"><Button disabled={!canEditSchedule} onClick={() => setScheduleEditorOpen(true)} size="sm" variant="outline">Edit payment schedule <Pencil className="size-4" /></Button><Button disabled={!canEditSchedule} onClick={() => setInterestEditorOpen(true)} size="sm" variant="outline">Edit interest terms <Pencil className="size-4" /></Button><Button disabled={!canEditSchedule || !customer || !schedules.length || villa.operationalStatus === "cancelled"} onClick={() => setCollectionOpen(true)} size="sm">Add collection <Plus className="size-4" /></Button></div></div>
    <section className="mt-7 flex flex-col justify-between gap-5 rounded-2xl border border-accent bg-primary px-6 py-6 text-primary-foreground sm:flex-row sm:items-center sm:px-8"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-xl bg-accent/40"><Home className="size-7" /></span><div><h1 className="text-2xl font-semibold">Villa {villa.number.replace(/^[A-Z]+-/, "")}</h1><p className="mt-1 text-primary-foreground/80">{projectName}</p></div></div><span className="self-start rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 sm:self-auto">{villaStatusLabels[villa.operationalStatus]}</span></section>
    <div className="mt-7 flex flex-wrap gap-3" role="tablist"><button aria-selected={activeTab === "overview"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "overview" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("overview")} role="tab" type="button">Overview</button><button aria-selected={activeTab === "documents"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "documents" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("documents")} role="tab" type="button">Document</button><button aria-selected={activeTab === "notes"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "notes" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("notes")} role="tab" type="button">Note</button>{canManageVilla && <button aria-selected={activeTab === "settings"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "settings" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("settings")} role="tab" type="button">Settings</button>}</div>
    {programmeFeedback && <div className="fixed right-4 top-4 z-40 flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-lg border border-success bg-success px-4 py-4 text-sm font-medium text-primary-foreground shadow-lg" role="status"><span className="flex items-center gap-3"><Info className="size-5" />{programmeFeedback}</span><button aria-label="Dismiss success message" className="rounded-md p-1 hover:bg-primary-foreground/15" onClick={() => setProgrammeFeedback("")}><X className="size-4" /></button></div>}{activeTab === "documents" ? <VillaDocumentsTab database={database} onSaved={() => { setProgrammeFeedback("Document link saved successfully."); window.setTimeout(() => window.location.reload(), 900); }} villa={villa} /> : activeTab === "notes" ? <VillaNotesTab database={database} onSaved={() => { setProgrammeFeedback("Villa note saved successfully."); window.setTimeout(() => window.location.reload(), 900); }} villa={villa} /> : activeTab === "settings" && canManageVilla ? <VillaSettingsPanel database={database} onCancelled={() => { setProgrammeFeedback("Villa programme cancelled successfully."); window.setTimeout(() => window.location.reload(), 900); }} onDeleted={() => { setProgrammeFeedback("Villa permanently deleted successfully."); window.setTimeout(() => router.push(`/projects/${projectId}`), 900); }} villa={villa} /> : <>
    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Villa value" value={formatLkr(financials.totalValue || villa.value)} /><MetricCard label="Principal collected" value={formatLkr(financials.principalCollected)} /><MetricCard label="Outstanding" value={formatLkr(financials.outstandingPrincipal)} /><MetricCard danger label="Overdue principal" value={formatLkr(financials.overduePrincipal)} /><MetricCard danger label="Interest due" value={formatLkr(financials.interestOutstanding)} /></section>
    {setupItems.some((item) => !item.complete) && <section className="mt-7 flex flex-col gap-5 rounded-2xl border border-accent bg-surface px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{setupItems.filter((item) => item.complete).length} of {setupItems.length} complete</p><h2 className="mt-2 text-lg font-semibold">Finish setting up this villa</h2><p className="mt-1 text-sm text-muted-foreground">Complete the missing details now, or return to them later.</p></div><div className="flex flex-wrap gap-2">{setupItems.map((item) => <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${item.complete ? "bg-success/10 text-success" : "bg-surface text-muted-foreground"}`} key={item.label}><CheckCircle2 className="size-4" />{item.label}</span>)}</div></section>}
    {customer && <section className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-accent bg-surface p-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-surface-muted font-semibold text-primary">{customer.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><p className="text-xs font-semibold text-muted-foreground">Customer</p><p className="mt-1 font-semibold">{customer.fullName}</p><p className="mt-1 text-sm text-muted-foreground">{customer.phone} <span aria-hidden="true">|</span> {customer.email}</p></div></div><Button disabled size="sm" variant="ghost">View <UserRound className="size-4" /></Button></section>}
    <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,0.9fr)]"><section className="overflow-hidden rounded-2xl border bg-surface"><div className="p-6"><h2 className="text-lg font-semibold">Payment schedule</h2><p className="mt-2 text-sm text-muted-foreground">Interest: {(terms.monthlyRate * 100).toFixed(1)}% monthly <span aria-hidden="true">·</span> {terms.gracePeriodDays}-day grace</p></div><div className="overflow-x-auto"><table className="min-w-180 w-full text-left"><thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-4">Stage &amp; deliverables</th><th className="px-5 py-4">Due / grace</th><th className="px-5 py-4">Principal balance</th><th className="px-5 py-4">Interest</th><th className="px-5 py-4">Total payable</th><th className="px-5 py-4">Status</th></tr></thead><tbody className="divide-y">{schedules.map((schedule) => <tr key={schedule.id}><td className="px-5 py-5"><p className="font-semibold">{schedule.stage}</p>{schedule.deliverables && <p className="mt-1 text-sm text-muted-foreground">{schedule.deliverables}</p>}</td><td className="px-5 py-5 text-sm"><p>{formatScheduleDate(schedule.dueDate)}</p><p className="mt-1 text-muted-foreground">{schedule.gracePeriodDays}-day grace</p></td><td className="px-5 py-5 text-sm font-semibold">{formatLkr(Math.max(0, schedule.principalAmount - schedule.principalPaid))}</td><td className="px-5 py-5 text-sm">{formatLkr(Math.max(0, schedule.interestAccrued - schedule.interestPaid))}</td><td className="px-5 py-5 text-sm font-semibold">{formatLkr(Math.max(0, schedule.principalAmount - schedule.principalPaid + schedule.interestAccrued - schedule.interestPaid))}</td><td className="px-5 py-5"><PaymentStatusBadge status={schedule.status} /></td></tr>)}</tbody></table></div></section>
      <aside className="space-y-5"><section className="rounded-2xl border bg-surface p-6"><h2 className="text-lg font-semibold">S&amp;P interest terms</h2><p className="mt-2 text-sm text-muted-foreground">Stored on this agreement</p><dl className="mt-5 divide-y text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Monthly rate</dt><dd className="font-semibold">{(terms.monthlyRate * 100).toFixed(1)}%</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Grace period</dt><dd className="font-semibold">{terms.gracePeriodDays} days</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Pro-rata divisor</dt><dd className="font-semibold">{terms.proRataDivisor} days</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Allocation</dt><dd className="font-semibold">Interest first</dd></div></dl></section><section className="rounded-2xl border bg-surface p-6"><h2 className="text-lg font-semibold">Collections</h2><p className="mt-2 text-sm text-muted-foreground">{collections.length} recorded payments</p><div className="mt-5 space-y-4">{collections.length ? collections.slice(0, 3).map((collection) => <div className="border-t pt-4" key={collection.id}><div className="flex justify-between gap-4"><p className="font-semibold">{new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${collection.paymentDate}T00:00:00`))}</p><p className="font-semibold">{formatLkr(collection.totalAmount)}</p></div><p className="mt-1 text-sm text-muted-foreground">{collection.paymentMethod.replace("_", " ")} <span aria-hidden="true">·</span> {collection.referenceNumber}</p></div>) : <p className="text-sm text-muted-foreground">No collections recorded.</p>}</div></section></aside>
    </div></>}{collectionOpen && customer && <RecordPaymentDialog customer={customer} database={database} key={`${villa.id}-${collectionOpen}`} onClose={() => setCollectionOpen(false)} onSuccess={(message) => { setCollectionOpen(false); onCollectionSaved(message); }} villa={villa} />}<PaymentScheduleDialog key={`${villa.id}-${scheduleEditorOpen}-${schedules.map((schedule) => schedule.id).join("-")}`} onOpenChange={setScheduleEditorOpen} onSaved={onScheduleSaved} open={scheduleEditorOpen} schedules={schedules} villa={villa} /><InterestTermsDialog key={`${villa.id}-${interestEditorOpen}-${villa.chargeLatePaymentInterest}`} onOpenChange={setInterestEditorOpen} onSaved={onInterestSaved} open={interestEditorOpen} terms={storedTerms} villa={villa} />
  </>;
}

export function VillaProfilePageClient({ projectId, villaId }: { projectId: string; villaId: string }) {
  const [database, setDatabase] = useState<MockDatabase | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    void mockRepository.getDatabase().then((nextDatabase) => { if (active) setDatabase(nextDatabase); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load villa."); });
    return () => { active = false; };
  }, []);

  const project = database?.projects.find((candidate) => candidate.id === projectId) ?? null;
  const summary = useMemo(() => database ? deriveVillaSummaries(database, projectId).find((item) => item.villa.id === villaId) ?? null : null, [database, projectId, villaId]);
  const placeholderNumber = villaId.startsWith("draft-") ? villaId.replace("draft-", "").padStart(2, "0") : "";
  const searchParams = useSearchParams();

  return <AppShell active="Projects & Villas"><div className="max-w-none">{feedback && <div className="fixed right-4 top-4 z-40 flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-lg border border-success bg-success px-4 py-4 text-sm font-medium text-primary-foreground shadow-lg" role="status"><span className="flex items-center gap-3"><Info className="size-5" />{feedback}</span><button aria-label="Dismiss success message" className="rounded-md p-1 hover:bg-primary-foreground/15" onClick={() => setFeedback("")}><X className="size-4" /></button></div>}{searchParams.get("created") === "1" && <div className="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success" role="status"><CheckCircle2 className="size-5" />Villa profile created successfully.</div>}{error ? <p className="rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p> : !database ? <div className="h-96 animate-pulse rounded-2xl border bg-surface-muted" /> : !project ? <div className="grid min-h-96 place-items-center rounded-xl border bg-surface"><div className="text-center"><h1 className="text-xl font-semibold">Villa not found</h1><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href="/projects">Return to projects</Link></div></div> : summary ? <ConfiguredVillaProfile database={database} onCollectionSaved={(message) => { setFeedback(message); void mockRepository.getDatabase().then(setDatabase).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to refresh villa.")); }} onInterestSaved={() => { setFeedback("Successfully updated interest terms."); void mockRepository.getDatabase().then(setDatabase).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to refresh villa.")); }} onScheduleSaved={() => { setFeedback("Successfully updated payment schedule."); void mockRepository.getDatabase().then(setDatabase).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to refresh villa.")); }} projectId={projectId} projectName={project.name} summary={summary} /> : placeholderNumber ? <EmptyVillaProfile number={placeholderNumber} projectId={projectId} projectName={project.name} /> : <div className="grid min-h-96 place-items-center rounded-xl border bg-surface"><div className="text-center"><FileText aria-hidden="true" className="mx-auto size-8 text-accent" /><h1 className="mt-4 text-xl font-semibold">Villa not found</h1><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href={`/projects/${projectId}`}>Return to villas</Link></div></div>}</div></AppShell>;
}
