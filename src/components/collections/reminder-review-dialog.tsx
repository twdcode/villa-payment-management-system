"use client";

import { AlertTriangle, BellRing, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MockDatabase, ReminderApproval } from "@/lib/domain/types";
import { calculateVillaFinancials, overdueDays, paymentStatus, principalOutstanding } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { reviewReminderApprovalAction } from "@/lib/actions/reminders";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { errorMessage } from "@/lib/errors";
import { renderReminderText } from "@/lib/reminders/tokens";
import { villaLabel } from "@/lib/domain/villa-label";


const reviewSchema = z.object({
  templateId: z.string().min(1, "Select a reminder template."),
  sendDate: z.string().min(1, "Select a reminder send date."),
  subject: z.string().trim().min(1, "Enter a reminder subject."),
  message: z.string().trim().min(1, "Enter a reminder message."),
  attachmentUrl: z.union([z.literal(""), z.string().trim().url("Enter a valid document link, or leave it empty.")]),
});

const statusLabel: Record<ReminderApproval["status"], string> = {
  awaiting_approval: "Awaiting approval",
  ready_to_send: "Ready to send",
  sent: "Sent",
  cancelled: "Cancelled",
};

const statusPill: Record<ReminderApproval["status"], string> = {
  awaiting_approval: "bg-warning/15 text-warning",
  ready_to_send: "bg-surface-muted text-primary",
  sent: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));


export function ReminderReviewDialog({ approval, database, onClose, onSuccess }: { approval: ReminderApproval; database: MockDatabase; onClose: () => void; onSuccess: (message: string) => void }) {
  const villa = database.villas.find((candidate) => candidate.id === approval.villaId);
  const customer = database.customers.find((candidate) => candidate.id === approval.customerId);
  const schedules = useMemo(() => database.schedules.filter((schedule) => schedule.villaId === approval.villaId), [approval.villaId, database.schedules]);
  const terms = resolveInterestTerms(database.settings, villa);
  const financials = calculateVillaFinancials(schedules, terms, database.today);
  const paymentDue = schedules.filter((schedule) => principalOutstanding(schedule) > 0).sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const defaultTemplate = database.reminderTemplates.find((template) => template.id === approval.templateId && template.isActive) ?? database.reminderTemplates.find((template) => template.type === "overdue" && template.isActive);
  const totalPayable = financials.outstandingPrincipal + financials.interestOutstanding;
  // Rendered before it reaches the form, not just when falling back to the template: a
  // cron-queued row always HAS a subject and message (copied verbatim from the template
  // by `try_queue_reminder()`), so the `??` fallback never fired for one and the reviewer
  // was shown — and approved — raw `{customer_name}` tokens.
  const tokens = {
    amount: paymentDue ? principalOutstanding(paymentDue) : totalPayable,
    companyName: database.settings.companyName,
    customerName: customer?.fullName ?? "Customer",
    dueDate: paymentDue?.dueDate ?? "",
    villaName: villaLabel(villa?.number) ?? "Villa",
  };
  const activeTemplates = database.reminderTemplates.filter((template) => template.isActive);
  const [form, setForm] = useState(() => ({ templateId: defaultTemplate?.id ?? "", sendDate: approval.sendDate, subject: renderReminderText(approval.subject ?? defaultTemplate?.subject ?? "", tokens), message: renderReminderText(approval.message ?? defaultTemplate?.message ?? "", tokens), attachmentUrl: approval.attachmentUrl ?? "" }));

  /**
   * Switching template rewrites the subject and message from the new one.
   *
   * The queue attaches a template by TYPE — `try_queue_reminder()` takes whichever
   * `overdue` template happens to be active — so the one a reminder arrives with is not
   * a decision anybody made about this customer. Without this the approver's only way to
   * use a different template was to retype it, so the dropdown that staff already get
   * when preparing a reminder belongs here too. Any hand-edits are replaced, which is the
   * point: picking a template means "use this wording".
   */
  function selectTemplate(templateId: string) {
    const template = activeTemplates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    setForm((current) => ({ ...current, templateId, subject: renderReminderText(template.subject, tokens), message: renderReminderText(template.message, tokens) }));
  }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"draft" | "send" | "cancel" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  /**
   * A cancelled or sent reminder is history, not work.
   *
   * The dialog still opens for those — "what did we email this customer?" and "why was
   * this not sent?" are exactly the questions asked afterwards — but every field is
   * read-only and the actions are gone, so it reads as a record rather than a form.
   */
  const actioned = approval.status === "cancelled" || approval.status === "sent";
  // Names come from the directory already in `database.users`; a missing one just leaves
  // the outcome unattributed rather than blocking the banner.
  const reviewer = approval.reviewedBy ? database.users.find((user) => user.id === approval.reviewedBy)?.name : undefined;
  const dateChanged = form.sendDate !== approval.sendDate;
  // The stage this reminder chases may have been settled while the row sat in the queue.
  // Surfaced here as well as enforced on the server, so the reviewer sees it before
  // clicking rather than as an error afterwards.
  const settled = paymentDue ? principalOutstanding(paymentDue) <= 0 : true;
  // Sending today something dated for later is a deliberate override, not a mistake — but
  // it should be a visible one.
  const sendsEarly = form.sendDate > database.today;

  if (!villa || !customer) return null;

  async function save(action: "draft" | "send" | "cancel") {
    if (action === "cancel") {
      if (rejectionReason.trim().length < 3) {
        setError("Enter a reason for cancelling this reminder.");
        return;
      }
      setSaving("cancel");
      setError("");
      try {
        await reviewReminderApprovalAction(approval.id, { ...form, action, rejectionReason: rejectionReason.trim() });
        onSuccess("Reminder cancelled.");
      } catch (reason) {
        setError(errorMessage(reason, "Unable to cancel this reminder."));
      } finally {
        setSaving(null);
      }
      return;
    }
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
  const villaName = villaLabel(villa.number);
  const isOverdue = paymentDue ? paymentStatus(paymentDue, database.today) === "overdue" : false;

  return <Dialog onOpenChange={(open) => !open && onClose()} open>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}>
      {/*
        Asked here rather than as an always-visible field with a disabled button: a button
        that looks broken until you notice an input elsewhere in the form is not an
        affordance. Matches the confirm-with-reason pattern the villa cancellation, villa
        deletion and interest waiver already use.
      */}
      {confirmCancel && <Dialog onOpenChange={(next) => !next && setConfirmCancel(false)} open>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-lg p-6" showClose={false}>
          <span className="grid size-11 place-items-center rounded-md bg-warning/15"><AlertTriangle className="size-5 text-warning" /></span>
          <DialogTitle className="mt-4 text-xl font-medium">Cancel this reminder?</DialogTitle>
          <DialogDescription className="mt-1">It will not be sent to {customer.email}, and will not return to the queue for this reminder day. Later reminder days for the same payment are unaffected.</DialogDescription>
          <label className="mt-5 block text-sm font-semibold text-muted-foreground">Reason<input autoFocus className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setRejectionReason(event.target.value)} placeholder="Why is this reminder not being sent?" value={rejectionReason} /></label>
          {error && <p className="mt-3 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
          <footer className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button onClick={() => setConfirmCancel(false)} type="button" variant="outline">Keep reminder</Button>
            <Button disabled={saving !== null || rejectionReason.trim().length < 3} onClick={() => void save("cancel")} type="button" variant="destructive">{saving === "cancel" ? "Cancelling..." : "Cancel reminder"}</Button>
          </footer>
        </DialogContent>
      </Dialog>}

      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="grid size-11 place-items-center rounded-md bg-surface-muted"><ShieldCheck className="size-5 text-primary" /></span>
          <DialogTitle className="mt-4 text-2xl font-medium">{actioned ? "Reminder record" : "Reminder details"}</DialogTitle>
          <DialogDescription className="mt-1">{villaName} · {stageLabel} · {formatLkr(totalPayable)}</DialogDescription>
        </div>
        <Button aria-label="Close reminder review" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${statusPill[approval.status]}`}>{statusLabel[approval.status]}</span>
        <span className="text-muted-foreground">Requested {formatDate(approval.requestedAt.slice(0, 10))}</span>
      </div>

      <section className="mt-4 grid overflow-hidden rounded-lg border sm:grid-cols-3">
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-semibold">{customer.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{customer.email}</p></div>
        {/*
          How late, and which stage — the two facts that decide whether this warrants a
          gentle nudge or a final notice. Without them the approver is choosing a template
          blind, which is the whole reason the queue cannot pick one for them.
        */}
        <div className="border-b p-4 sm:border-b-0 sm:border-r"><p className="text-xs text-muted-foreground">Payment due</p><p className="mt-1 font-semibold">{paymentDue ? formatDate(paymentDue.dueDate) : "No unpaid stage"}</p><p className={`mt-1 text-xs ${isOverdue ? "font-semibold text-danger" : "text-muted-foreground"}`}>{isOverdue && paymentDue ? `${overdueDays(paymentDue, database.today)} days overdue` : "Not yet overdue"}{paymentDue?.stage ? ` · ${paymentDue.stage}` : ""}</p></div>
        <div className="p-4"><p className="text-xs text-muted-foreground">Total payable</p><p className="mt-1 font-semibold">{formatLkr(totalPayable)}</p><p className="mt-1 text-xs text-muted-foreground">Principal and current interest</p></div>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-muted-foreground">Reminder template<Select disabled={actioned} onValueChange={selectTemplate} value={form.templateId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select template" /></SelectTrigger><SelectContent>{activeTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select><span className="mt-1 block text-xs font-normal text-muted-foreground">Changing this replaces the subject and message below.</span></label>
        <label className="text-sm font-semibold text-muted-foreground">Reminder send date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" disabled={actioned} onChange={(event) => setForm({ ...form, sendDate: event.target.value })} type="date" value={form.sendDate} /></label>
      </div>
      <div className="mt-4 rounded-md border bg-surface-subtle p-4"><p className="text-xs text-muted-foreground">Payment due date</p><p className="mt-1 font-semibold">{paymentDue ? formatDate(paymentDue.dueDate) : "No unpaid stage"}</p><p className="mt-1 text-xs text-muted-foreground">Changing the reminder date does not change the payment due date.</p></div>
      {dateChanged && <p className="mt-3 rounded-md bg-warning/15 px-4 py-3 text-sm font-medium text-warning">The send date changed. Save as draft to apply it before sending.</p>}
      <label className="mt-4 block text-sm font-semibold text-muted-foreground">Subject<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" disabled={actioned} onChange={(event) => setForm({ ...form, subject: event.target.value })} value={form.subject} /></label>
      <label className="mt-4 block text-sm font-semibold text-muted-foreground">Message<textarea className="mt-2 min-h-40 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground" disabled={actioned} onChange={(event) => setForm({ ...form, message: event.target.value })} value={form.message} /></label>
      <label className="mt-4 block text-sm font-semibold text-muted-foreground">Supporting document link <span className="font-normal">(optional)</span><input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground" disabled={actioned} onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })} placeholder="https://drive.google.com/..." type="url" value={form.attachmentUrl} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Paste a link to an invoice or statement hosted elsewhere. Files are not uploaded or stored here.</span></label>
      {actioned
        ? approval.status === "cancelled"
          ? <div className="mt-4 rounded-md bg-warning/15 px-4 py-3 text-sm text-warning"><p className="font-semibold">Cancelled{reviewer ? ` by ${reviewer}` : ""}{approval.reviewedAt ? ` on ${formatDate(approval.reviewedAt.slice(0, 10))}` : ""}</p>{approval.rejectionReason && <p className="mt-1">{approval.rejectionReason}</p>}</div>
          : <div className={`mt-4 rounded-md px-4 py-3 text-sm ${approval.deliveryStatus === "failed" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}><p className="font-semibold">{approval.deliveryStatus === "failed" ? "Delivery failed" : "Sent"}{reviewer ? ` by ${reviewer}` : ""}{approval.sentAt ? ` on ${formatDate(approval.sentAt.slice(0, 10))}` : ""}</p><p className="mt-1">{approval.deliveryError ?? `Emailed to ${customer.email}.`}</p></div>
        : settled
          ? <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger">This payment has been settled since the reminder was queued. Cancel it rather than sending a request for money already received.</p>
          : <p className="mt-4 rounded-md bg-success/10 px-4 py-3 text-sm text-success">Sending emails this reminder to {customer.email} straight away. There is no further confirmation step.</p>}
      {!actioned && !settled && sendsEarly && <p className="mt-3 rounded-md bg-warning/15 px-4 py-3 text-sm font-medium text-warning">This reminder is scheduled for {formatDate(form.sendDate)}. Sending now delivers it ahead of that date.</p>}
      {error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button onClick={onClose} type="button" variant={actioned ? "outline" : "ghost"}>Close</Button>
        {!actioned && <>
          <Button className="text-danger hover:text-danger" disabled={saving !== null} onClick={() => { setRejectionReason(""); setConfirmCancel(true); }} type="button" variant="outline">Cancel reminder</Button>
          <Button disabled={saving !== null} onClick={() => void save("draft")} type="button" variant="outline">{saving === "draft" ? "Saving..." : "Save new date"}</Button>
          <Button disabled={saving !== null || dateChanged || settled} onClick={() => void save("send")} type="button"><BellRing className="size-4" />{saving === "send" ? "Sending..." : "Send now"}</Button>
        </>}
      </footer>
    </DialogContent>
  </Dialog>;
}
