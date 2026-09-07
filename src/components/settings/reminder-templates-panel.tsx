"use client";

import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MockDatabase, ReminderTemplate } from "@/lib/domain/types";
import { reminderTemplateTypeLabels } from "@/lib/domain/status-labels";
import { createReminderTemplateAction, updateReminderTemplateAction, deleteReminderTemplateAction, setReminderTemplateActiveAction } from "@/lib/actions/reminder-templates";
import { errorMessage } from "@/lib/errors";


const REMINDER_TEMPLATE_TYPES = ["upcoming", "overdue", "payment_received", "final_notice", "custom"] as const;

const templateSchema = z.object({
  type: z.enum(REMINDER_TEMPLATE_TYPES),
  name: z.string().trim().min(2, "Template name must contain at least two characters."),
  subject: z.string().trim().min(1, "Enter an email subject.").max(120, "Email subject cannot exceed 120 characters."),
  message: z.string().trim().min(1, "Enter a reminder message."),
});

type TemplateForm = z.infer<typeof templateSchema>;

const fieldTokens = ["{customer_name}", "{villa_number}", "{amount}", "{due_date}", "{company_name}"];
const templateTypeLabels = reminderTemplateTypeLabels;
const templateTypeOrder: Record<ReminderTemplate["type"], number> = { upcoming: 0, overdue: 1, payment_received: 2, final_notice: 3, custom: 4 };
const templateTypeIcons: Record<ReminderTemplate["type"], typeof Bell> = { upcoming: CalendarDays, overdue: AlertTriangle, payment_received: CheckCircle2, final_notice: Bell, custom: Bell };
/**
 * `upcoming` / `overdue` / `final_notice` / `payment_received` are what the cron's
 * `try_queue_reminder()` matches on — it looks up "the active template of this type", so a
 * template must actually be tagged with one of these to be found automatically. `custom`
 * is the only type templates got before this form had a type picker at all, and stays
 * available for messages sent manually by name rather than matched by trigger.
 */

function TemplateFormDialog({ template, onClose, onSaved }: { template: ReminderTemplate | null; onClose: () => void; onSaved: (template: ReminderTemplate, message: string) => void }) {
  const isEditing = Boolean(template);
  const [form, setForm] = useState<TemplateForm>({ type: template?.type ?? "custom", name: template?.name ?? "", subject: template?.subject ?? "", message: template?.message ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = useMemo(() => templateSchema.safeParse(form).success, [form]);

  function insertToken(token: string) {
    const textarea = messageRef.current;
    const start = textarea?.selectionStart ?? form.message.length;
    const end = textarea?.selectionEnd ?? start;
    const spacer = start > 0 && !/\s$/.test(form.message.slice(0, start)) ? " " : "";
    const nextMessage = `${form.message.slice(0, start)}${spacer}${token}${form.message.slice(end)}`;
    const caret = start + spacer.length + token.length;
    setForm({ ...form, message: nextMessage });
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(caret, caret); });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = templateSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the reminder template.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = template
        ? await updateReminderTemplateAction(template.id, parsed.data)
        : await createReminderTemplateAction(parsed.data);
      onSaved(saved, template ? "Reminder template updated successfully." : "Reminder template added successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save the reminder template."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto p-5 sm:w-[calc(100%-2rem)] sm:p-8">
        <span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Bell className="size-5" /></span>
        <div><DialogTitle className="text-2xl font-medium">{isEditing ? "Edit reminder template" : "Add reminder template"}</DialogTitle><DialogDescription className="mt-2 text-sm text-muted-foreground">Set the email subject and customer-facing message.</DialogDescription></div>
        <form onSubmit={submit}>
          <label className="block max-w-md text-sm font-semibold text-muted-foreground">Reminder type<Select onValueChange={(next) => setForm({ ...form, type: next as ReminderTemplate["type"] })} value={form.type}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{REMINDER_TEMPLATE_TYPES.map((type) => <SelectItem key={type} value={type}>{templateTypeLabels[type]}</SelectItem>)}</SelectContent></Select><span className="mt-1 block text-xs font-normal text-muted-foreground">{form.type === "custom" ? "Sent manually by name — not matched to a schedule trigger automatically." : "The daily check uses one active template per type to prepare this reminder for approval automatically."}</span></label>
          <label className="mt-5 block max-w-md text-sm font-semibold text-muted-foreground">Template name<Input autoFocus className="mt-2" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. 7-day payment reminder" value={form.name} /></label>
          <label className="mt-5 block text-sm font-semibold text-muted-foreground">Email subject<Input className="mt-2" maxLength={120} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Payment reminder for {villa_number}" value={form.subject} /><span className="mt-1 block text-right text-xs font-normal text-muted-foreground">{form.subject.length}/120</span></label>
          <label className="mt-4 block text-sm font-semibold text-muted-foreground">Message<textarea className="mt-2 min-h-44 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Write the message your customer will receive..." ref={messageRef} value={form.message} /></label>
          <fieldset className="mt-3"><legend className="text-xs text-muted-foreground">Insert a customer field</legend><div className="mt-2 flex flex-wrap gap-2">{fieldTokens.map((token) => <button className="rounded-full border bg-surface-muted px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" key={token} onClick={() => insertToken(token)} type="button">{token}</button>)}</div></fieldset>
          <section aria-label="Email preview" className="mt-5 rounded-lg border bg-surface-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Email preview</p><p className="mt-3 font-semibold">{form.subject || "Your subject will appear here"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{form.message || "Your reminder message will appear here."}</p></section>
          {error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button disabled={!canSubmit || saving} type="submit">{saving ? "Saving..." : "Save template"}</Button></footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTemplateDialog({ template, onClose, onDeleted }: { template: ReminderTemplate; onClose: () => void; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await deleteReminderTemplateAction(template.id);
      onDeleted(template.id);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to delete this reminder template."));
      setDeleting(false);
    }
  }
  return <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open><DialogContent className="max-w-xl text-center" showClose={false}><span className="mx-auto grid size-16 place-items-center rounded-full bg-danger/10 text-danger"><AlertTriangle className="size-7" /></span><div><DialogTitle className="text-2xl font-medium">Delete {template.name}?</DialogTitle><DialogDescription className="mt-3 text-sm text-muted-foreground">This removes the reminder template from Settings and Collections. This action cannot be undone.</DialogDescription></div>{error && <p className="rounded-md bg-danger/10 px-4 py-3 text-left text-sm font-medium text-danger" role="alert">{error}</p>}<div className="flex flex-col-reverse justify-center gap-3 sm:flex-row"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button disabled={deleting} onClick={() => void remove()} variant="destructive">{deleting ? "Deleting..." : "Delete"}</Button></div></DialogContent></Dialog>;
}

export function ReminderTemplatesPanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; template: ReminderTemplate } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReminderTemplate | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const templates = [...database.reminderTemplates].sort((left, right) => templateTypeOrder[left.type] - templateTypeOrder[right.type]);

  function saveTemplate(template: ReminderTemplate, message: string) {
    const exists = database.reminderTemplates.some((candidate) => candidate.id === template.id);
    const reminderTemplates = exists ? database.reminderTemplates.map((candidate) => candidate.id === template.id ? template : candidate) : [...database.reminderTemplates, template];
    setEditor(null);
    onSaved({ ...database, reminderTemplates }, message);
  }

  async function changeStatus(template: ReminderTemplate) {
    setBusyId(template.id);
    setError("");
    try {
      const updated = await setReminderTemplateActiveAction(template.id, !template.isActive);
      onSaved({ ...database, reminderTemplates: database.reminderTemplates.map((candidate) => candidate.id === template.id ? updated : candidate) }, updated.isActive ? "Reminder template enabled successfully." : "Reminder template disabled successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to change the reminder template status."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <section className="min-w-0 rounded-lg border bg-surface p-5 sm:p-7">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-2xl font-medium">Reminder templates</h2><p className="mt-2 text-sm text-muted-foreground">Reusable email messages available from Collections and Customer profiles</p></div><Button className="self-start" onClick={() => setEditor({ mode: "create" })}><Plus className="size-4" />Add template</Button></header>
        <div className="mt-6 flex items-center gap-3 rounded-md bg-surface-muted p-4"><Bell className="size-5 shrink-0" /><div><p className="font-semibold">Personalise automatically</p><p className="mt-1 text-xs text-muted-foreground">Use the available customer, villa, amount and due-date fields inside subjects and messages.</p></div></div>
        {error && <p className="mt-5 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{templates.map((template) => { const Icon = templateTypeIcons[template.type]; return <article className={`flex min-h-64 min-w-0 flex-col overflow-hidden rounded-lg border ${template.isActive ? "" : "bg-surface-subtle"}`} key={template.id}><div className={`flex flex-1 flex-col p-5 ${template.isActive ? "" : "opacity-50"}`}><div className="flex items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-muted"><Icon className="size-5" /></span><span className={`flex items-center gap-1.5 text-xs font-semibold ${template.isActive ? "text-success" : "text-muted-foreground"}`}><span aria-hidden className={`size-2 rounded-full ${template.isActive ? "bg-success" : "bg-muted-foreground"}`} />{template.isActive ? "Active" : "Disabled"}</span></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{templateTypeLabels[template.type]}</p><h3 className="mt-3 font-semibold">{template.name}</h3><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{template.subject}</p></div><div className="flex items-center gap-3 border-t px-4 py-3"><Button className="h-auto px-1 py-1" disabled={busyId === template.id} onClick={() => setEditor({ mode: "edit", template })} size="sm" variant="ghost">Edit</Button>{template.isActive ? <Button className="h-auto px-1 py-1" disabled={busyId === template.id} onClick={() => void changeStatus(template)} size="sm" variant="ghost">Disable</Button> : <Tooltip><TooltipTrigger asChild><Button className="h-auto px-1 py-1" disabled={busyId === template.id} onClick={() => void changeStatus(template)} size="sm" variant="ghost">Enable</Button></TooltipTrigger><TooltipContent>Click &quot;Enable&quot; to activate this template.</TooltipContent></Tooltip>}<Button className="h-auto px-1 py-1 text-danger hover:text-danger" disabled={busyId === template.id} onClick={() => setDeleteTarget(template)} size="sm" variant="ghost">Delete</Button></div></article>; })}</div>
      </section>
      {editor && <TemplateFormDialog key={editor.mode === "edit" ? editor.template.id : "new-template"} onClose={() => setEditor(null)} onSaved={saveTemplate} template={editor.mode === "edit" ? editor.template : null} />}
      {deleteTarget && <DeleteTemplateDialog onClose={() => setDeleteTarget(null)} onDeleted={(id) => { setDeleteTarget(null); onSaved({ ...database, reminderTemplates: database.reminderTemplates.filter((template) => template.id !== id), deletedReminderTemplateIds: [...new Set([...(database.deletedReminderTemplateIds ?? []), id])] }, "Reminder template deleted successfully."); }} template={deleteTarget} />}
    </TooltipProvider>
  );
}
