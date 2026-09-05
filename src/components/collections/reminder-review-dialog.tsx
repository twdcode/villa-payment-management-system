"use client";

import { BellRing, FileUp, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEMO_TODAY } from "@/lib/config/demo";
import type { MockDatabase, ReminderApproval } from "@/lib/domain/types";
import { calculateVillaFinancials, paymentStatus, principalOutstanding } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { reviewReminderApprovalAction } from "@/lib/actions/reminders";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { errorMessage } from "@/lib/errors";


const reviewSchema = z.object({
  sendDate: z.string().min(1, "Select a reminder send date."),
  subject: z.string().trim().min(1, "Enter a reminder subject."),
  message: z.string().trim().min(1, "Enter a reminder message."),
  attachmentName: z.string().trim().min(1, "Upload a supporting document."),
});

const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const applyTemplate = (value: string, customerName: string, villaName: string, total: number) => value.replaceAll("{{customer_name}}", customerName).replaceAll("{{villa_name}}", villaName).replaceAll("{{outstanding_amount}}", formatLkr(total));

export function ReminderReviewDialog({ approval, database, onClose, onSuccess }: { approval: ReminderApproval; database: MockDatabase; onClose: () => void; onSuccess: (message: string) => void }) {
  const villa = database.villas.find((candidate) => candidate.id === approval.villaId);
  const customer = database.customers.find((candidate) => candidate.id === approval.customerId);
  const schedules = useMemo(() => database.schedules.filter((schedule) => schedule.villaId === approval.villaId), [approval.villaId, database.schedules]);
  const terms = resolveInterestTerms(database.settings, villa);
  const financials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
  const paymentDue = schedules.filter((schedule) => principalOutstanding(schedule) > 0).sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const defaultTemplate = database.reminderTemplates.find((template) => template.id === approval.templateId && template.isActive) ?? database.reminderTemplates.find((template) => template.type === "overdue" && template.isActive);
  const totalPayable = financials.outstandingPrincipal + financials.interestOutstanding;
  const [form, setForm] = useState(() => ({ sendDate: approval.sendDate, subject: approval.subject ?? (defaultTemplate ? applyTemplate(defaultTemplate.subject, customer?.fullName ?? "Customer", villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Villa", totalPayable) : ""), message: approval.message ?? (defaultTemplate ? applyTemplate(defaultTemplate.message, customer?.fullName ?? "Customer", villa?.number.replace(/^[A-Z]+-/, "Villa ") ?? "Villa", totalPayable) : ""), attachmentName: approval.attachmentName ?? "" }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  const dateChanged = form.sendDate !== approval.sendDate;

  if (!villa || !customer) return null;

  async function save(action: "draft" | "send") {
    const parsed = reviewSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the reminder details.");
      return;
    }
    if (action === "send" && dateChanged) {
      setError("Save the changed reminder date as a draft before sending.");
      return;
    }
    setSaving(action);
    setError("");
    try {
      await reviewReminderApprovalAction(approval.id, { ...parsed.data, action });
      onSuccess(action === "send" ? "Reminder sent successfully." : "Reminder draft saved successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update this reminder."));
    } finally {
      setSaving(null);
    }
  }

  const stageLabel = paymentDue?.stage ?? "Payment";
  const villaName = villa.number.replace(/^[A-Z]+-/, "Villa ");
  const isOverdue = paymentDue ? paymentStatus(paymentDue, DEMO_TODAY) === "overdue" : false;

  return <Dialog onOpenChange={(open) => !open && onClose()} open>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="grid size-11 place-items-center rounded-md bg-surface-muted"><ShieldCheck className="size-5 text-primary" /></span>
          <DialogTitle className="mt-4 text-2xl font-medium">Reminder details</DialogTitle>
          <DialogDescription className="mt-1">{villaName} · {stageLabel} · {formatLkr(totalPayable)}</DialogDescription>
        </div>
        <Button aria-label="Close reminder review" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-surface-muted px-3 py-1 font-semibold text-primary">{approval.status === "ready_to_send" ? "Ready to send" : "Awaiting approval"}</span>
        <span className="text-muted-foreground">Requested {formatDate(approval.requestedAt.slice(0, 10))}</span>
      </div>

      <section className="mt-4 grid overflow-hidden rounded-lg border sm:grid-cols-3">
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-semibold">{customer.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{customer.email}</p></div>
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><p className="text-xs text-muted-foreground">Payment due</p><p className="mt-1 font-semibold">{paymentDue ? formatDate(paymentDue.dueDate) : "No unpaid stage"}</p><p className="mt-1 text-xs text-muted-foreground">{isOverdue ? "Payment is overdue" : "Current payment stage"}</p></div>
        <div className="p-4"><p className="text-xs text-muted-foreground">Total payable</p><p className="mt-1 font-semibold">{formatLkr(totalPayable)}</p><p className="mt-1 text-xs text-muted-foreground">Principal and current interest</p></div>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-muted-foreground">Reminder send date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, sendDate: event.target.value })} type="date" value={form.sendDate} /></label>
        <div className="rounded-md border bg-surface-subtle p-4"><p className="text-xs text-muted-foreground">Payment due date</p><p className="mt-1 font-semibold">{paymentDue ? formatDate(paymentDue.dueDate) : "No unpaid stage"}</p><p className="mt-1 text-xs text-muted-foreground">Changing the reminder date does not change the payment due date.</p></div>
      </div>
      {dateChanged && <p className="mt-3 rounded-md bg-warning/15 px-4 py-3 text-sm font-medium text-warning">The send date changed. Save as draft to apply it before sending.</p>}
      <label className="mt-4 block text-sm font-semibold text-muted-foreground">Subject<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, subject: event.target.value })} value={form.subject} /></label>
      <label className="mt-4 block text-sm font-semibold text-muted-foreground">Message<textarea className="mt-2 min-h-40 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, message: event.target.value })} value={form.message} /></label>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-surface p-4 text-sm font-semibold"><FileUp className="size-5 text-primary" /><span className="min-w-0 flex-1 truncate">{form.attachmentName || "Upload supporting document"}</span><input accept="application/pdf" className="sr-only" onChange={(event) => setForm({ ...form, attachmentName: event.target.files?.[0]?.name ?? "" })} type="file" /></label>
      <p className="mt-4 rounded-md bg-success/10 px-4 py-3 text-sm text-success">The attachment filename is retained in this Phase 1 workspace. The customer email is simulated when you send the reminder.</p>
      {error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
        <Button disabled={saving !== null} onClick={() => void save("draft")} type="button" variant="outline">{saving === "draft" ? "Saving..." : "Save as draft"}</Button>
        <Button disabled={saving !== null || dateChanged} onClick={() => void save("send")} type="button"><BellRing className="size-4" />{saving === "send" ? "Sending..." : "Send now"}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
