"use client";

import { AlertTriangle, ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, FileText, Home, Pencil, Plus, ShieldAlert, Trash2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { z } from "zod";

import { RecordPaymentDialog } from "@/components/collections/record-payment-dialog";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_PAYMENT_SCHEDULE_STAGES } from "@/lib/config/defaults";
import type { Customer, DocumentLink, InterestTerms, MockDatabase, PaymentSchedule, PaymentStatus, Villa, VillaOperationalStatus } from "@/lib/domain/types";
import { paymentStatusLabels, villaStatusLabels } from "@/lib/domain/status-labels";
import { formatLkr } from "@/lib/formatters";
import { interestOutstanding, isPaymentScheduleReady, principalOutstanding, totalOutstanding } from "@/lib/finance/calculations";
import { deriveVillaSummaries, type VillaSummary } from "@/lib/projects/villa-summary";
import { can } from "@/lib/permissions/roles";
import type { PaymentScheduleUpdateInput } from "@/lib/repositories/contracts";
import { updatePaymentScheduleAction, previewInterestWaiverAction, updateVillaInterestTermsAction, cancelVillaAction, deleteVillaPermanentlyAction, addVillaNoteAction, addVillaDocumentAction, updateVillaDocumentAction, deleteVillaDocumentAction, updateVillaAction, reassignVillaCustomerAction } from "@/lib/actions/villas";
import { resolveInterestTerms, storedInterestTerms } from "@/lib/domain/interest-terms";
import { errorMessage } from "@/lib/errors";
import { percentToRate, rateToPercent } from "@/lib/domain/rate";
import { villaLabel } from "@/lib/domain/villa-label";
import { useCurrentUser } from "@/components/auth/current-user-provider";


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
  const [waiver, setWaiver] = useState<{ entries: Array<{ scheduleId: string; stage: string; amount: number }>; reason: string } | null>(null);
  const total = drafts.reduce((sum, draft) => sum + draft.principalAmount, 0);
  const difference = villa.value - total;

  function updateDraft(clientId: string, patch: Partial<ScheduleDraft>) {
    setDrafts((current) => current.map((draft) => draft.clientId === clientId ? { ...draft, ...patch } : draft));
  }

  const payload = () => drafts.map((draft) => ({ id: draft.id, stage: draft.stage, deliverables: draft.deliverables, dueDate: draft.dueDate, principalAmount: draft.principalAmount, gracePeriodDays: draft.gracePeriodDays }));

  async function commit(reason?: string) {
    setError("");
    setSaving(true);
    try {
      await updatePaymentScheduleAction(villa.id, payload(), reason);
      setWaiver(null);
      onOpenChange(false);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure, "Unable to update payment schedule."));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Checks whether saving would wipe out interest already charged, and asks first.
   *
   * Extending a stage's grace period is deliberate — it is how the company gives a late
   * customer a break — but the same field is edited during ordinary schedule maintenance,
   * where silently writing off money would be a nasty surprise. The prompt only appears
   * when real money is at stake; edits that waive nothing save straight through.
   */
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const changed = drafts.flatMap((draft) => {
      const current = schedules.find((schedule) => schedule.id === draft.id);
      return draft.id && current && current.gracePeriodDays !== draft.gracePeriodDays
        ? [{ scheduleId: draft.id, gracePeriodDays: draft.gracePeriodDays }]
        : [];
    });
    if (changed.length) {
      setSaving(true);
      try {
        const affected = await previewInterestWaiverAction(villa.id, changed);
        if (affected.length) {
          setWaiver({ entries: affected, reason: "" });
          return;
        }
      } catch (failure) {
        setError(errorMessage(failure, "Unable to check the interest impact of this change."));
        return;
      } finally {
        setSaving(false);
      }
    }
    await commit();
  }

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[90rem] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-[calc(100%-2rem)]" showClose={false}>
      <div className="shrink-0 border-b bg-surface px-5 py-5 sm:px-7 sm:py-6"><div className="flex items-start justify-between gap-5"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><CalendarDays className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium sm:text-2xl">Update payment schedule</DialogTitle><DialogDescription className="mt-1 text-sm text-muted-foreground">{villaLabel(villa.number)} · Edit stages, due dates, amounts and construction deliverables.</DialogDescription></div><Button aria-label="Close payment schedule editor" className="shrink-0" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div>
        <dl className="mt-5 grid gap-3 rounded-lg bg-surface-subtle p-4 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Villa value</dt><dd className="mt-1 text-sm font-semibold">{formatLkr(villa.value)}</dd></div><div><dt className="text-xs text-muted-foreground">Schedule total</dt><dd className="mt-1 text-sm font-semibold">{formatLkr(total)}</dd></div><div><dt className="text-xs text-muted-foreground">Difference</dt><dd className={`mt-1 text-sm font-semibold ${difference === 0 ? "" : "text-danger"}`}>{formatLkr(Math.abs(difference))}{difference === 0 ? "" : difference > 0 ? " remaining" : " over"}</dd></div></dl>
      </div>
      {waiver && <Dialog onOpenChange={(next) => !next && setWaiver(null)} open>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-lg p-6" showClose={false}>
          <span className="grid size-11 place-items-center rounded-md bg-warning/15"><AlertTriangle className="size-5 text-warning" /></span>
          <DialogTitle className="mt-4 text-xl font-medium">Remove interest already charged?</DialogTitle>
          <DialogDescription className="mt-1">Extending the grace period writes off interest that has already accrued on {waiver.entries.length === 1 ? "this stage" : "these stages"}.</DialogDescription>
          <ul className="mt-4 space-y-2 rounded-lg bg-surface-subtle p-4 text-sm">
            {waiver.entries.map((entry) => <li className="flex items-center justify-between gap-4" key={entry.scheduleId}><span className="min-w-0 truncate">{entry.stage}</span><span className="shrink-0 font-semibold text-danger">&minus;{formatLkr(entry.amount)}</span></li>)}
            {waiver.entries.length > 1 && <li className="flex items-center justify-between gap-4 border-t pt-2 font-semibold"><span>Total</span><span className="text-danger">&minus;{formatLkr(waiver.entries.reduce((sum, entry) => sum + entry.amount, 0))}</span></li>}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Interest the customer has already paid is not refunded by this change.</p>
          <label className="mt-4 block text-sm font-semibold text-muted-foreground">Reason<input autoFocus className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setWaiver((current) => current && { ...current, reason: event.target.value })} placeholder="Why is this interest being written off?" value={waiver.reason} /></label>
          {error && <p className="mt-3 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
          <footer className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button onClick={() => setWaiver(null)} type="button" variant="outline">Cancel</Button>
            <Button disabled={saving || waiver.reason.trim().length < 3} onClick={() => void commit(waiver.reason)} type="button">{saving ? "Saving..." : "Waive interest and save"}</Button>
          </footer>
        </DialogContent>
      </Dialog>}
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="space-y-4">{drafts.map((draft, index) => <section className="rounded-lg border bg-surface p-4 sm:p-5" key={draft.clientId}><div className="flex items-center justify-between gap-4"><h3 className="text-sm font-semibold">{index + 1}. {draft.stage || "Payment stage"}</h3><Button className="h-auto px-0 py-1 text-xs text-danger hover:bg-transparent hover:text-danger" disabled={draft.principalPaid > 0 || drafts.length === 1} onClick={() => setDrafts((current) => current.filter((candidate) => candidate.clientId !== draft.clientId))} type="button" variant="ghost">Remove</Button></div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"><label className="text-sm font-semibold text-muted-foreground">Stage name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { stage: event.target.value })} value={draft.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Due date<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { dueDate: event.target.value })} type="date" value={draft.dueDate} /></label><label className="text-sm font-semibold text-muted-foreground">Amount<CurrencyInput className="h-11" onChange={(next) => updateDraft(draft.clientId, { principalAmount: Number(next) || 0 })} value={draft.principalAmount ? String(draft.principalAmount) : ""} /></label><label className="text-sm font-semibold text-muted-foreground">Grace period (days)<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" inputMode="numeric" min={0} onChange={(event) => updateDraft(draft.clientId, { gracePeriodDays: Math.max(0, Number(event.target.value.replace(/[^0-9]/g, "")) || 0) })} type="number" value={draft.gracePeriodDays} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Interest starts after this many days past the due date.</span></label><div className="text-sm font-semibold text-muted-foreground">Paid to date<div className="mt-2 flex h-11 items-center rounded-md border bg-surface-muted px-3 text-sm text-muted-foreground">{formatLkr(draft.principalPaid)}</div></div></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Stage deliverables<textarea className="mt-2 min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateDraft(draft.clientId, { deliverables: event.target.value })} placeholder="Construction work or documents delivered at this stage..." value={draft.deliverables ?? ""} /></label></section>)}</div><Button className="mt-5 w-full border-dashed sm:w-auto" onClick={() => setDrafts((current) => [...current, { clientId: crypto.randomUUID(), stage: "", deliverables: "", dueDate: "", principalAmount: 0, gracePeriodDays: villa.interestTerms?.gracePeriodDays ?? 30, principalPaid: 0 }])} type="button" variant="outline"><Plus className="size-4" />Add payment stage</Button></div><footer className="shrink-0 border-t bg-surface px-5 py-4 sm:px-7"><p className="mb-3 text-sm text-muted-foreground">Incomplete schedules can be saved and finished later. They cannot be used for collections until every stage is complete.</p>{error && <p className="mb-3 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}<div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save schedule"}</Button></div></footer></form>
    </DialogContent>
  </Dialog>;
}

/** Whole-number fields edited as raw strings so a cleared box does not snap back to "0". */
const TERM_COUNT_FIELDS = ["gracePeriodDays", "proRataDivisor", "reminderDaysAfterDue", "secondReminderDaysAfterDue", "finalNoticeDaysAfterDue"] as const;
type TermCountField = (typeof TERM_COUNT_FIELDS)[number];

function InterestTermsDialog({ onOpenChange, onSaved, open, terms: initialTerms, villa }: { onOpenChange: (open: boolean) => void; onSaved: () => void; open: boolean; terms: InterestTerms; villa: Villa }) {
  const [chargeLatePaymentInterest, setChargeLatePaymentInterest] = useState(villa.chargeLatePaymentInterest ?? true);
  const [terms, setTerms] = useState(initialTerms);
  // See NumberInput: `Number("")` is 0, so holding these as numbers made a cleared field
  // redisplay "0" and the next keystroke produce "013". The strings are converted on save.
  const [counts, setCounts] = useState<Record<TermCountField, string>>(() =>
    Object.fromEntries(TERM_COUNT_FIELDS.map((field) => [field, String(initialTerms[field] ?? "")])) as Record<TermCountField, string>,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !chargeLatePaymentInterest;

  function updateTerms(patch: Partial<InterestTerms>) {
    setTerms((current) => ({ ...current, ...patch }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const blank = TERM_COUNT_FIELDS.find((field) => counts[field].trim() === "");
    if (blank) {
      setError("Fill in every day and divisor field before saving.");
      return;
    }
    setSaving(true);
    try {
      const numericTerms: InterestTerms = { ...terms, ...Object.fromEntries(TERM_COUNT_FIELDS.map((field) => [field, Number(counts[field])])) };
      await updateVillaInterestTermsAction(villa.id, { chargeLatePaymentInterest, interestTerms: numericTerms });
      onOpenChange(false);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update interest terms."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-[calc(100%-2rem)]" showClose={false}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-5"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Clock3 className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium sm:text-2xl">Update interest terms</DialogTitle><DialogDescription className="mt-1 text-sm text-muted-foreground">{villaLabel(villa.number)} · S&amp;P late-payment settings</DialogDescription></div><Button aria-label="Close interest terms editor" className="shrink-0" onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-lg bg-surface-subtle p-4 text-sm font-semibold"><input checked={chargeLatePaymentInterest} className="size-5 rounded border accent-primary" onChange={(event) => setChargeLatePaymentInterest(event.target.checked)} type="checkbox" />Charge late-payment interest</label>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={disabled}>
            <label className="text-sm font-semibold text-muted-foreground">Monthly rate (%)<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" min="0" onChange={(event) => updateTerms({ monthlyRate: percentToRate(Number(event.target.value)) })} step="0.1" type="number" value={rateToPercent(terms.monthlyRate).toString()} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Grace period (days)<NumberInput className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" disabled={disabled} onChange={(next) => setCounts((current) => ({ ...current, gracePeriodDays: next }))} value={counts.gracePeriodDays} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Pro-rata day divisor<NumberInput className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" disabled={disabled} onChange={(next) => setCounts((current) => ({ ...current, proRataDivisor: next }))} value={counts.proRataDivisor} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Interest start<Select disabled={disabled} onValueChange={(next) => updateTerms({ interestStart: next as InterestTerms["interestStart"] })} value={terms.interestStart}><SelectTrigger className="mt-2 h-11 disabled:bg-surface-muted"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="after_grace">After grace period</SelectItem><SelectItem value="from_due_date">From due date</SelectItem></SelectContent></Select></label>
            <label className="text-sm font-semibold text-muted-foreground">First reminder day<NumberInput className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" disabled={disabled} onChange={(next) => setCounts((current) => ({ ...current, reminderDaysAfterDue: next }))} value={counts.reminderDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Second reminder day<NumberInput className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" disabled={disabled} onChange={(next) => setCounts((current) => ({ ...current, secondReminderDaysAfterDue: next }))} value={counts.secondReminderDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Final notice day<NumberInput className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-muted" disabled={disabled} onChange={(next) => setCounts((current) => ({ ...current, finalNoticeDaysAfterDue: next }))} value={counts.finalNoticeDaysAfterDue} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Collection allocation<Select disabled={disabled} onValueChange={(next) => updateTerms({ allocationOrder: next as InterestTerms["allocationOrder"] })} value={terms.allocationOrder}><SelectTrigger className="mt-2 h-11 disabled:bg-surface-muted"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="interest_first">Interest first</SelectItem><SelectItem value="principal_first">Principal first</SelectItem></SelectContent></Select></label>
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
        await cancelVillaAction(villa.id, reason);
        setAction(null);
        onCancelled();
      } else {
        await deleteVillaPermanentlyAction(villa.id, reason);
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

/**
 * `currentUser` comes from the auth context, not from the workspace user list: permission
 * checks must read the signed-in user's real role, and the list carries display names only.
 */
function NoteComposer({ onSaved, villa }: { onSaved: () => void; villa: Villa }) {
  const currentUser = useCurrentUser();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canAddNote = currentUser ? can(currentUser.role, "add_notes") : false;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await addVillaNoteAction(villa.id, content);
      setContent("");
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save this villa note."));
    } finally {
      setSaving(false);
    }
  }

  return <aside className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Add villa note</h2><p className="mt-2 text-sm text-muted-foreground">Visible only on {villaLabel(villa.number)}</p><form className="mt-6" onSubmit={save}><label className="text-sm font-semibold text-muted-foreground">Note<textarea className="mt-2 min-h-40 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canAddNote} onChange={(event) => setContent(event.target.value)} placeholder="Write a construction update, decision or villa-specific follow-up..." value={content} /></label>{error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-4 flex items-center gap-3 rounded-lg bg-surface-subtle p-3"><span className="grid size-10 place-items-center rounded-full bg-surface-muted text-sm font-bold text-primary">{currentUser?.name.split(" ").map((part) => part[0]).join("").slice(0, 2) ?? "JV"}</span><div><p className="text-xs text-muted-foreground">Posting as</p><p className="mt-1 text-sm font-semibold">{currentUser?.name ?? "Juniper user"}</p></div></div><Button className="mt-4 w-full" disabled={!canAddNote || content.trim().length === 0 || saving} type="submit"><Plus className="size-4" />{saving ? "Saving..." : "Save note"}</Button></form></aside>;
}

/**
 * Editing/removing a document is an Editor+ right (PRD: Staff may only "add" document
 * links), so this is a second, narrower check than `canManageDocuments` below, which
 * gates adding. Mirrors `updateVillaDocumentAction`'s inline role check.
 */
function useCanEditDocuments() {
  const currentUser = useCurrentUser() ?? undefined;
  return currentUser?.role === "super_admin" || currentUser?.role === "editor";
}

function EditDocumentDialog({ document, onClose, onSaved, villaId }: { document: DocumentLink; onClose: () => void; onSaved: () => void; villaId: string }) {
  const [form, setForm] = useState({ name: document.name, date: document.date, url: document.url });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = documentLinkSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the document details."); return; }
    setError("");
    setSaving(true);
    try {
      await updateVillaDocumentAction(document.id, villaId, parsed.data);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update this document link."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={save}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Pencil className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium">Edit document link</DialogTitle><DialogDescription className="mt-1">{document.name}</DialogDescription></div><Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><label className="mt-5 block text-sm font-semibold text-muted-foreground">Document name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document date<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} type="date" value={form.date} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document link<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} type="url" value={form.url} /></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save changes"}</Button></footer></form></DialogContent></Dialog>;
}

function DeleteDocumentDialog({ document, onClose, onDeleted, villaId }: { document: DocumentLink; onClose: () => void; onDeleted: () => void; villaId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await deleteVillaDocumentAction(document.id, villaId, reason);
      onDeleted();
    } catch (reason_) {
      setError(errorMessage(reason_, "Unable to remove this document link."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={confirm}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-danger/10 text-danger"><Trash2 className="size-5" /></span><DialogTitle className="mt-4 text-xl font-medium">Remove document link?</DialogTitle><DialogDescription className="mt-1">{document.name}</DialogDescription></div><Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><p className="mt-4 text-sm text-muted-foreground">This removes only the saved reference — the external file itself is untouched. The link stays in audit history.</p><label className="mt-5 block text-sm font-semibold text-muted-foreground">Reason<textarea className="mt-2 min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setReason(event.target.value)} placeholder="Explain why this document link is being removed..." value={reason} /></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={reason.trim().length < 3 || saving} type="submit" variant="destructive">{saving ? "Removing..." : "Remove document"}</Button></footer></form></DialogContent></Dialog>;
}

function VillaDocumentsTab({ database, onSaved, villa }: { database: MockDatabase; onSaved: (message: string) => void; villa: Villa }) {
  const [form, setForm] = useState({ name: "", date: "", url: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentLink | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<DocumentLink | null>(null);
  const documents = database.documents.filter((document) => document.villaId === villa.id);
  const currentUser = useCurrentUser() ?? undefined;
  const canManageDocuments = currentUser ? can(currentUser.role, "manage_documents") : false;
  const canEditDocuments = useCanEditDocuments();

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = documentLinkSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the document details."); return; }
    setError("");
    setSaving(true);
    try {
      await addVillaDocumentAction(villa.id, parsed.data);
      setForm({ name: "", date: "", url: "" });
      onSaved("Document link saved successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save this document link."));
    } finally {
      setSaving(false);
    }
  }

  return <><section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.85fr)]"><div className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Villa documents</h2><p className="mt-2 text-sm text-muted-foreground">Saved links to property documents. Files stay in their original location.</p>{documents.length ? <div className="mt-6 divide-y border-t">{documents.map((document) => <article className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between" key={document.id}><div className="flex min-w-0 items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-muted"><FileText className="size-6 text-primary" /></span><div className="min-w-0"><h3 className="truncate font-semibold">{document.name}</h3><p className="mt-1 text-sm text-muted-foreground">Document date · {formatScheduleDate(document.date)}</p><p className="mt-1 text-xs text-muted-foreground">Added by {database.users.find((user) => user.id === document.createdBy)?.name ?? "Juniper team"} · {new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(document.createdAt))}</p></div></div><div className="flex shrink-0 items-center gap-4"><a className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href={document.url} rel="noreferrer" target="_blank">Open link <ArrowLeft className="size-4 rotate-180" /></a>{canEditDocuments && <div className="flex items-center gap-1"><Button aria-label={`Edit ${document.name}`} onClick={() => setEditingDocument(document)} size="icon" type="button" variant="ghost"><Pencil className="size-4" /></Button><Button aria-label={`Remove ${document.name}`} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setDeletingDocument(document)} size="icon" type="button" variant="ghost"><Trash2 className="size-4" /></Button></div>}</div></article>)}</div> : <div className="mt-6 grid min-h-56 place-items-center rounded-xl border border-dashed bg-surface-subtle px-6 text-center"><div><FileText className="mx-auto size-8 text-accent" /><p className="mt-3 font-semibold">No villa documents yet</p><p className="mt-1 text-sm text-muted-foreground">Document links will appear here when they are added.</p></div></div>}</div><aside className="rounded-2xl border bg-surface p-6 sm:p-7"><h2 className="text-xl font-semibold">Add document link</h2><p className="mt-2 text-sm text-muted-foreground">No upload is needed</p><form className="mt-6" onSubmit={save}><label className="block text-sm font-semibold text-muted-foreground">Document name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sale and Purchase Agreement" value={form.name} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document date<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} type="date" value={form.date} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document link<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" disabled={!canManageDocuments} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://drive.google.com/..." type="url" value={form.url} /></label><p className="mt-4 flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-3 text-xs text-muted-foreground"><CheckCircle2 className="size-5 shrink-0 text-success" />Only the link will be saved. The document is not uploaded to Juniper.</p>{error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}<Button className="mt-4 w-full" disabled={!canManageDocuments || !form.name.trim() || !form.date || !form.url.trim() || saving} type="submit"><Plus className="size-4" />{saving ? "Saving..." : "Save document"}</Button></form></aside></section>{editingDocument && <EditDocumentDialog document={editingDocument} onClose={() => setEditingDocument(null)} onSaved={() => { setEditingDocument(null); onSaved("Document link updated successfully."); }} villaId={villa.id} />}{deletingDocument && <DeleteDocumentDialog document={deletingDocument} onClose={() => setDeletingDocument(null)} onDeleted={() => { setDeletingDocument(null); onSaved("Document link removed successfully."); }} villaId={villa.id} />}</>;
}

function VillaNotesTab({ database, onSaved, villa }: { database: MockDatabase; onSaved: () => void; villa: Villa }) {
  const notes = database.notes.filter((note) => note.villaId === villa.id && !note.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = notes.reduce<Record<string, typeof notes>>((result, note) => { const key = note.createdAt.slice(0, 10); (result[key] ??= []).push(note); return result; }, {});

  return <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.85fr)]"><div className="rounded-2xl border bg-surface p-6 sm:p-7">{Object.keys(groups).length ? Object.entries(groups).map(([date, entries]) => <section className="border-t pt-5 first:border-t-0 first:pt-0" key={date}><h2 className="text-lg font-semibold text-muted-foreground">{date.replaceAll("-", "/")}</h2>{entries.map((note) => { const author = database.users.find((user) => user.id === note.authorId); return <article className="mt-5" key={note.id}><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-surface-muted text-sm font-bold text-primary">{author?.name.split(" ").map((part) => part[0]).join("").slice(0, 2) ?? "JV"}</span><div><h3 className="font-semibold">{author?.name ?? "Juniper team"}</h3><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("en-LK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(note.createdAt))}</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{note.content}</p></article>; })}</section>) : <div className="grid min-h-72 place-items-center text-center"><div><FileText className="mx-auto size-8 text-accent" /><p className="mt-3 font-semibold">No villa notes yet</p><p className="mt-1 text-sm text-muted-foreground">Add the first update for this villa.</p></div></div>}</div><NoteComposer onSaved={onSaved} villa={villa} /></section>;
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

const EDITABLE_STATUSES: Exclude<VillaOperationalStatus, "cancelled">[] = ["available", "reserved", "scheduled", "sold"];

/**
 * "Edit Villa Details" from the PRD's five primary villa-profile actions. Deliberately
 * does not include villa value — see the `VillaDetailsUpdate` doc comment on why that is
 * a schedule-editing concern, not a details-editing one.
 */
function EditVillaDetailsDialog({ onClose, onSaved, villa }: { onClose: () => void; onSaved: () => void; villa: Villa }) {
  const [form, setForm] = useState({ number: villa.number, type: villa.type, saleStatus: (villa.operationalStatus === "cancelled" ? "available" : villa.operationalStatus) as Exclude<VillaOperationalStatus, "cancelled"> });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.number.trim() || !form.type.trim()) { setError("Enter a villa number and type."); return; }
    setError("");
    setSaving(true);
    try {
      await updateVillaAction(villa.id, form);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update villa details."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={save}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Home className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium">Edit villa details</DialogTitle><DialogDescription className="mt-1">{villaLabel(villa.number)}</DialogDescription></div><Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><label className="mt-5 block text-sm font-semibold text-muted-foreground">Villa name / number<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} placeholder="e.g. 12, MB-04 or Sunset Villa" value={form.number} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Must be unique within the project.</span></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Villa type<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} value={form.type} /></label><label className="mt-4 block text-sm font-semibold text-muted-foreground">Operational status<Select onValueChange={(next) => setForm((current) => ({ ...current, saleStatus: next as Exclude<VillaOperationalStatus, "cancelled"> }))} value={form.saleStatus}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent>{EDITABLE_STATUSES.map((status) => <SelectItem key={status} value={status}>{villaStatusLabels[status]}</SelectItem>)}</SelectContent></Select></label><p className="mt-3 text-xs text-muted-foreground">Villa value is set from the payment schedule total — edit it from &quot;Edit payment schedule&quot; instead. Cancelling the programme is a separate action under Settings.</p>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save changes"}</Button></footer></form></DialogContent></Dialog>;
}

type ReassignMode = "existing" | "new";

/** Changing the assigned customer — a `villa_customers` insert/close pair, never an edit of history. See `reassignVillaCustomer`. */
function ReassignCustomerDialog({ currentCustomer, database, onClose, onSaved, villa }: { currentCustomer: Customer | null; database: MockDatabase; onClose: () => void; onSaved: () => void; villa: Villa }) {
  const otherCustomers = database.customers.filter((candidate) => candidate.id !== currentCustomer?.id);
  const [mode, setMode] = useState<ReassignMode>("existing");
  const [customerId, setCustomerId] = useState(otherCustomers[0]?.id ?? "");
  const [newCustomer, setNewCustomer] = useState({ fullName: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "existing" && !customerId) { setError("Select a customer."); return; }
    if (mode === "new" && (!newCustomer.fullName.trim() || !newCustomer.email.trim() || !newCustomer.phone.trim())) { setError("Complete the new customer's name, email, and phone."); return; }
    setError("");
    setSaving(true);
    try {
      await reassignVillaCustomerAction(villa.id, mode === "existing" ? { customerId } : { newCustomer });
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Unable to reassign this villa."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={save}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><UserRound className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-xl font-medium">{currentCustomer ? "Change assigned customer" : "Assign a customer"}</DialogTitle><DialogDescription className="mt-1">{currentCustomer ? `Currently ${currentCustomer.fullName}` : villaLabel(villa.number)}</DialogDescription></div><Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><p className="mt-4 rounded-md bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">Past collections and receipts stay linked to {currentCustomer ? currentCustomer.fullName : "the previous customer"} — reassigning only changes who this villa is billed to going forward.</p><div className="mt-5 flex gap-3"><Button className="flex-1" onClick={() => setMode("existing")} type="button" variant={mode === "existing" ? "default" : "outline"}>Existing customer</Button><Button className="flex-1" onClick={() => setMode("new")} type="button" variant={mode === "new" ? "default" : "outline"}>New customer</Button></div>{mode === "existing" ? <label className="mt-4 block text-sm font-semibold text-muted-foreground">Customer<Select onValueChange={setCustomerId} value={customerId}><SelectTrigger className="mt-2 h-11"><SelectValue placeholder="Select a customer" /></SelectTrigger><SelectContent>{otherCustomers.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.fullName}</SelectItem>)}</SelectContent></Select></label> : <div className="mt-4 space-y-4"><label className="block text-sm font-semibold text-muted-foreground">Full name<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setNewCustomer((current) => ({ ...current, fullName: event.target.value }))} value={newCustomer.fullName} /></label><label className="block text-sm font-semibold text-muted-foreground">Email<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} type="email" value={newCustomer.email} /></label><label className="block text-sm font-semibold text-muted-foreground">Phone<input className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} value={newCustomer.phone} /></label></div>}{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save assignment"}</Button></footer></form></DialogContent></Dialog>;
}

function ConfiguredVillaProfile({ database, onCollectionSaved, onDetailsSaved, onInterestSaved, onReassignSaved, onScheduleSaved, projectId, projectName, summary }: { database: MockDatabase; onCollectionSaved: (message: string) => void; onDetailsSaved: () => void; onInterestSaved: () => void; onReassignSaved: () => void; onScheduleSaved: () => void; projectId: string; projectName: string; summary: VillaSummary }) {
  const { customer, financials, villa } = summary;
  const schedules = database.schedules.filter((schedule) => schedule.villaId === villa.id);
  const collections = database.collections.filter((collection) => collection.villaId === villa.id && collection.status === "confirmed");
  const storedTerms = storedInterestTerms(database.settings, villa);
  const terms = resolveInterestTerms(database.settings, villa);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [interestEditorOpen, setInterestEditorOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [detailsEditorOpen, setDetailsEditorOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const role = useCurrentUser()?.role ?? "view_only";
  const canEditSchedule = role !== "view_only";
  const canManageVilla = role === "super_admin";
  const canEditVilla = role === "super_admin" || role === "editor";
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "notes" | "settings">("overview");
  const { toast } = useToast();
  const router = useRouter();
  const setupItems = [
    { label: "Villa details", complete: true },
    { label: "Customer assigned", complete: Boolean(customer) },
    { label: "Payment schedule", complete: scheduleIsComplete(schedules, villa.value) },
  ];

  return <>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><Link className="inline-flex items-center gap-2 text-sm font-semibold hover:text-muted-foreground" href={`/projects/${projectId}`}><ArrowLeft className="size-4" />All villas</Link><div className="flex flex-wrap gap-3"><Button disabled={!canEditVilla || villa.operationalStatus === "cancelled"} onClick={() => setDetailsEditorOpen(true)} size="sm" variant="outline">Edit villa details <Pencil className="size-4" /></Button><Button disabled={!canEditSchedule} onClick={() => setScheduleEditorOpen(true)} size="sm" variant="outline">Edit payment schedule <Pencil className="size-4" /></Button><Button disabled={!canEditSchedule} onClick={() => setInterestEditorOpen(true)} size="sm" variant="outline">Edit interest terms <Pencil className="size-4" /></Button><Button disabled={!canEditSchedule || !customer || !schedules.length || villa.operationalStatus === "cancelled"} onClick={() => setCollectionOpen(true)} size="sm">Add collection <Plus className="size-4" /></Button></div></div>
    <section className="mt-7 flex flex-col justify-between gap-5 rounded-2xl border border-accent bg-primary px-6 py-6 text-primary-foreground sm:flex-row sm:items-center sm:px-8"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-xl bg-accent/40"><Home className="size-7" /></span><div><h1 className="text-2xl font-semibold">{villaLabel(villa.number)}</h1><p className="mt-1 text-primary-foreground/80">{projectName}</p></div></div><span className="self-start rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 sm:self-auto">{villaStatusLabels[villa.operationalStatus]}</span></section>
    <div className="mt-7 flex flex-wrap gap-3" role="tablist"><button aria-selected={activeTab === "overview"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "overview" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("overview")} role="tab" type="button">Overview</button><button aria-selected={activeTab === "documents"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "documents" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("documents")} role="tab" type="button">Document</button><button aria-selected={activeTab === "notes"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "notes" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("notes")} role="tab" type="button">Note</button>{canManageVilla && <button aria-selected={activeTab === "settings"} className={`rounded-xl border px-5 py-3 text-sm font-semibold ${activeTab === "settings" ? "bg-surface-muted" : "bg-surface text-muted-foreground"}`} onClick={() => setActiveTab("settings")} role="tab" type="button">Settings</button>}</div>
    {activeTab === "documents" ? <VillaDocumentsTab database={database} onSaved={(message) => { toast(message); router.refresh(); }} villa={villa} /> : activeTab === "notes" ? <VillaNotesTab database={database} onSaved={() => { toast("Villa note saved successfully."); router.refresh(); }} villa={villa} /> : activeTab === "settings" && canManageVilla ? <VillaSettingsPanel database={database} onCancelled={() => { toast("Villa programme cancelled successfully."); router.refresh(); }} onDeleted={() => { toast("Villa permanently deleted successfully."); router.push(`/projects/${projectId}`); }} villa={villa} /> : <>
    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MetricCard label="Villa value" value={formatLkr(financials.totalValue || villa.value)} /><MetricCard label="Principal collected" value={formatLkr(financials.principalCollected)} /><MetricCard label="Outstanding" value={formatLkr(financials.outstandingPrincipal)} /><MetricCard danger label="Overdue principal" value={formatLkr(financials.overduePrincipal)} /><MetricCard danger label="Interest due" value={formatLkr(financials.interestOutstanding)} /></section>
    {setupItems.some((item) => !item.complete) && <section className="mt-7 flex flex-col gap-5 rounded-2xl border border-accent bg-surface px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{setupItems.filter((item) => item.complete).length} of {setupItems.length} complete</p><h2 className="mt-2 text-lg font-semibold">Finish setting up this villa</h2><p className="mt-1 text-sm text-muted-foreground">Complete the missing details now, or return to them later.</p></div><div className="flex flex-wrap gap-2">{setupItems.map((item) => <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${item.complete ? "bg-success/10 text-success" : "bg-surface text-muted-foreground"}`} key={item.label}><CheckCircle2 className="size-4" />{item.label}</span>)}</div></section>}
    {customer ? <section className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-accent bg-surface p-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-surface-muted font-semibold text-primary">{customer.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><p className="text-xs font-semibold text-muted-foreground">Customer</p><p className="mt-1 font-semibold">{customer.fullName}</p><p className="mt-1 text-sm text-muted-foreground">{customer.phone} <span aria-hidden="true">|</span> {customer.email}</p></div></div><div className="flex gap-2"><Button asChild size="sm" variant="ghost"><Link href={`/customers/${customer.id}`}>View <UserRound className="size-4" /></Link></Button>{canEditVilla && villa.operationalStatus !== "cancelled" && <Button onClick={() => setReassignOpen(true)} size="sm" variant="outline">Change <Pencil className="size-4" /></Button>}</div></section> : canEditVilla && villa.operationalStatus !== "cancelled" && <section className="mt-7 flex flex-col justify-between gap-4 rounded-2xl border border-dashed bg-surface-subtle p-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-full bg-surface-muted"><UserRound className="size-6 text-muted-foreground" /></span><div><p className="text-xs font-semibold text-muted-foreground">Customer</p><p className="mt-1 font-semibold">No customer assigned</p></div></div><Button onClick={() => setReassignOpen(true)} size="sm" variant="outline">Assign customer <Plus className="size-4" /></Button></section>}
    <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,0.9fr)]"><section className="overflow-hidden rounded-2xl border bg-surface"><div className="p-6"><h2 className="text-lg font-semibold">Payment schedule</h2><p className="mt-2 text-sm text-muted-foreground">Interest: {rateToPercent(terms.monthlyRate).toFixed(1)}% monthly <span aria-hidden="true">·</span> {terms.gracePeriodDays}-day grace</p></div><div className="overflow-x-auto"><table className="min-w-180 w-full text-left"><thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-4">Stage &amp; deliverables</th><th className="px-5 py-4">Due / grace</th><th className="px-5 py-4">Principal balance</th><th className="px-5 py-4">Interest</th><th className="px-5 py-4">Total payable</th><th className="px-5 py-4">Status</th></tr></thead><tbody className="divide-y">{schedules.map((schedule) => <tr key={schedule.id}><td className="px-5 py-5"><p className="font-semibold">{schedule.stage}</p>{schedule.deliverables && <p className="mt-1 text-sm text-muted-foreground">{schedule.deliverables}</p>}</td><td className="px-5 py-5 text-sm"><p>{formatScheduleDate(schedule.dueDate)}</p><p className="mt-1 text-muted-foreground">{schedule.gracePeriodDays}-day grace</p></td><td className="px-5 py-5 text-sm font-semibold">{formatLkr(principalOutstanding(schedule))}</td><td className="px-5 py-5 text-sm">{formatLkr(interestOutstanding(schedule))}</td><td className="px-5 py-5 text-sm font-semibold">{formatLkr(totalOutstanding(schedule))}</td><td className="px-5 py-5"><PaymentStatusBadge status={schedule.status} /></td></tr>)}</tbody></table></div></section>
      <aside className="space-y-5"><section className="rounded-2xl border bg-surface p-6"><h2 className="text-lg font-semibold">S&amp;P interest terms</h2><p className="mt-2 text-sm text-muted-foreground">Stored on this agreement</p><dl className="mt-5 divide-y text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Monthly rate</dt><dd className="font-semibold">{rateToPercent(terms.monthlyRate).toFixed(1)}%</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Grace period</dt><dd className="font-semibold">{terms.gracePeriodDays} days</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Pro-rata divisor</dt><dd className="font-semibold">{terms.proRataDivisor} days</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Allocation</dt><dd className="font-semibold">Interest first</dd></div></dl></section><section className="rounded-2xl border bg-surface p-6"><h2 className="text-lg font-semibold">Collections</h2><p className="mt-2 text-sm text-muted-foreground">{collections.length} recorded payments</p><div className="mt-5 space-y-4">{collections.length ? collections.slice(0, 3).map((collection) => <div className="border-t pt-4" key={collection.id}><div className="flex justify-between gap-4"><p className="font-semibold">{new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${collection.paymentDate}T00:00:00`))}</p><p className="font-semibold">{formatLkr(collection.totalAmount)}</p></div><p className="mt-1 text-sm text-muted-foreground">{collection.paymentMethod.replace("_", " ")} <span aria-hidden="true">·</span> {collection.referenceNumber}</p></div>) : <p className="text-sm text-muted-foreground">No collections recorded.</p>}</div></section></aside>
    </div></>}{collectionOpen && customer && <RecordPaymentDialog customer={customer} database={database} key={`${villa.id}-${collectionOpen}`} onClose={() => setCollectionOpen(false)} onSuccess={(message) => { setCollectionOpen(false); onCollectionSaved(message); }} villa={villa} />}<PaymentScheduleDialog key={`${villa.id}-${scheduleEditorOpen}-${schedules.map((schedule) => schedule.id).join("-")}`} onOpenChange={setScheduleEditorOpen} onSaved={onScheduleSaved} open={scheduleEditorOpen} schedules={schedules} villa={villa} /><InterestTermsDialog key={`${villa.id}-${interestEditorOpen}-${villa.chargeLatePaymentInterest}`} onOpenChange={setInterestEditorOpen} onSaved={onInterestSaved} open={interestEditorOpen} terms={storedTerms} villa={villa} />{detailsEditorOpen && <EditVillaDetailsDialog onClose={() => setDetailsEditorOpen(false)} onSaved={() => { setDetailsEditorOpen(false); onDetailsSaved(); }} villa={villa} />}{reassignOpen && <ReassignCustomerDialog currentCustomer={customer ?? null} database={database} onClose={() => setReassignOpen(false)} onSaved={() => { setReassignOpen(false); onReassignSaved(); }} villa={villa} />}
  </>;
}

/** `initialData`: fetched server-side by `app/projects/[projectId]/villas/[villaId]/page.tsx`. See dashboard-page-client.tsx for why it stays optional. */
export function VillaProfilePageClient({ projectId, villaId, database }: { projectId: string; villaId: string; database: MockDatabase }) {
  return (
    <AppShell active="Projects & Villas">
      <VillaProfilePageBody database={database} projectId={projectId} villaId={villaId} />
    </AppShell>
  );
}

/** Split so `useToast()` resolves under AppShell's provider — see ProjectsPageBody. */
function VillaProfilePageBody({ projectId, villaId, database }: { projectId: string; villaId: string; database: MockDatabase }) {
  const router = useRouter();
  const { toast } = useToast();

  const project = database.projects.find((candidate) => candidate.id === projectId) ?? null;
  const summary = useMemo(() => deriveVillaSummaries(database, projectId).find((item) => item.villa.id === villaId) ?? null, [database, projectId, villaId]);
  const placeholderNumber = villaId.startsWith("draft-") ? villaId.replace("draft-", "").padStart(2, "0") : "";
  const searchParams = useSearchParams();

  return <div className="max-w-none">{searchParams.get("created") === "1" && <div className="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success" role="status"><CheckCircle2 className="size-5" />Villa profile created successfully.</div>}{!project ? <div className="grid min-h-96 place-items-center rounded-xl border bg-surface"><div className="text-center"><h1 className="text-xl font-semibold">Villa not found</h1><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href="/projects">Return to projects</Link></div></div> : summary ? <ConfiguredVillaProfile database={database} onCollectionSaved={(message) => { toast(message); router.refresh(); }} onDetailsSaved={() => { toast("Successfully updated villa details."); router.refresh(); }} onInterestSaved={() => { toast("Successfully updated interest terms."); router.refresh(); }} onReassignSaved={() => { toast("Successfully updated the assigned customer."); router.refresh(); }} onScheduleSaved={() => { toast("Successfully updated payment schedule."); router.refresh(); }} projectId={projectId} projectName={project.name} summary={summary} /> : placeholderNumber ? <EmptyVillaProfile number={placeholderNumber} projectId={projectId} projectName={project.name} /> : <div className="grid min-h-96 place-items-center rounded-xl border bg-surface"><div className="text-center"><FileText aria-hidden="true" className="mx-auto size-8 text-accent" /><h1 className="mt-4 text-xl font-semibold">Villa not found</h1><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href={`/projects/${projectId}`}>Return to villas</Link></div></div>}</div>;
}
