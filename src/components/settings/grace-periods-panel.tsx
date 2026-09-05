"use client";

import { AlertTriangle, CalendarDays, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GracePeriod, MockDatabase, WorkspaceSettings } from "@/lib/domain/types";
import { createGracePeriodAction, updateGracePeriodAction, deleteGracePeriodAction, setGracePeriodActiveAction } from "@/lib/actions/settings";
import { errorMessage } from "@/lib/errors";


const gracePeriodSchema = z.object({
  name: z.string().trim().min(2, "Grace period name must contain at least two characters."),
  // `z.coerce.number()` turns "" into 0, which would silently save a blank box as zero —
  // so an empty value is mapped to NaN and rejected rather than coerced.
  days: z.union([z.number(), z.string()])
    .transform((value) => (typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value)))
    .refine((value) => Number.isInteger(value), "Enter the number of days as a whole number.")
    .refine((value) => value >= 0, "Number of days cannot be negative."),
  description: z.string().trim().max(300, "Description cannot exceed 300 characters."),
  useAsDefault: z.boolean(),
});

/**
 * `days` is the raw string from the input, not a number: an empty box has to stay empty
 * while editing. `gracePeriodSchema` coerces it on submit, and an empty string fails the
 * `.int()` check, so a blank field cannot be saved.
 */
type GracePeriodForm = Omit<z.infer<typeof gracePeriodSchema>, "days"> & { days: string };

function GracePeriodFormDialog({ period, onClose, onSaved }: { period: GracePeriod | null; onClose: () => void; onSaved: (settings: WorkspaceSettings, message: string) => void }) {
  const isEditing = Boolean(period);
  const [form, setForm] = useState<GracePeriodForm>({ name: period?.name ?? "", days: String(period?.days ?? 30), description: period?.description ?? "", useAsDefault: period?.isDefault ?? false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const canSubmit = useMemo(() => gracePeriodSchema.safeParse(form).success, [form]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = gracePeriodSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the grace period details.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const settings = period
        ? await updateGracePeriodAction(period.id, parsed.data)
        : await createGracePeriodAction(parsed.data);
      onSaved(settings, period ? "Grace period updated successfully." : "Grace period added successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save the grace period."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-5 sm:w-[calc(100%-2rem)] sm:p-8"><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><CalendarDays className="size-5" /></span><div><DialogTitle className="text-2xl font-medium">{isEditing ? "Edit grace period" : "Add grace period"}</DialogTitle><DialogDescription className="mt-2">{isEditing ? "Update this reusable payment extension for future agreements." : "Create a clear payment extension that can be reused across agreements."}</DialogDescription></div><form onSubmit={submit}><label className="block text-sm font-semibold text-muted-foreground">Grace period name<Input autoFocus className="mt-2" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Extended grace period" value={form.name} /></label><label className="mt-5 block text-sm font-semibold text-muted-foreground">Number of days<NumberInput className="mt-2" onChange={(days) => setForm({ ...form, days })} value={form.days} /></label><label className="mt-5 block text-sm font-semibold text-muted-foreground">Description<textarea className="mt-2 min-h-28 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={300} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explain when the team should use this grace period..." value={form.description} /></label><label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border bg-surface-muted p-4"><input checked={form.useAsDefault} className="mt-0.5 size-5 accent-primary" onChange={(event) => setForm({ ...form, useAsDefault: event.target.checked })} type="checkbox" /><span><span className="block text-sm font-semibold">Use as the default</span><span className="mt-1 block text-xs text-muted-foreground">Apply {form.days} days to future payment agreements.</span></span></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button disabled={!canSubmit || saving} type="submit">{saving ? "Saving..." : "Save grace period"}</Button></footer></form></DialogContent></Dialog>;
}

function DeleteGracePeriodDialog({ period, onClose, onDeleted }: { period: GracePeriod; onClose: () => void; onDeleted: (settings: WorkspaceSettings) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      onDeleted(await deleteGracePeriodAction(period.id));
    } catch (reason) {
      setError(errorMessage(reason, "Unable to delete this grace period."));
      setDeleting(false);
    }
  }
  return <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open><DialogContent className="max-w-xl text-center" showClose={false}><span className="mx-auto grid size-16 place-items-center rounded-full bg-danger/10 text-danger"><AlertTriangle className="size-7" /></span><div><DialogTitle className="text-2xl font-medium">Delete {period.name}?</DialogTitle><DialogDescription className="mt-3">This removes the grace period from Settings. Existing villa agreements remain unchanged, and this action cannot be undone.</DialogDescription></div>{error && <p className="rounded-md bg-danger/10 px-4 py-3 text-left text-sm font-medium text-danger" role="alert">{error}</p>}<div className="flex flex-col-reverse justify-center gap-3 sm:flex-row"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button disabled={deleting} onClick={() => void remove()} variant="destructive">{deleting ? "Deleting..." : "Delete"}</Button></div></DialogContent></Dialog>;
}

export function GracePeriodsPanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; period: GracePeriod } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GracePeriod | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const periods = [...database.settings.gracePeriods].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
  const defaultPeriod = periods.find((period) => period.isDefault) ?? periods[0];

  function saveSettings(settings: WorkspaceSettings, message: string) {
    setEditor(null);
    onSaved({ ...database, settings }, message);
  }

  async function changeStatus(period: GracePeriod) {
    setBusyId(period.id);
    setError("");
    try {
      const settings = await setGracePeriodActiveAction(period.id, !period.isActive);
      onSaved({ ...database, settings }, period.isActive ? "Grace period disabled successfully." : "Grace period enabled successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to change the grace period status."));
    } finally {
      setBusyId("");
    }
  }

  return <TooltipProvider delayDuration={250}><section className="min-w-0 rounded-lg border bg-surface p-5 sm:p-7"><header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-2xl font-medium">Grace periods</h2><p className="mt-2 text-sm text-muted-foreground">Create reusable payment extensions and choose the default for new agreements</p></div><Button className="self-start" onClick={() => setEditor({ mode: "create" })}><Plus className="size-4" />Add grace period</Button></header>{defaultPeriod && <div className="mt-6 flex items-center gap-5 rounded-lg bg-primary p-5 text-primary-foreground"><p className="shrink-0 text-4xl font-semibold">{defaultPeriod.days}<span className="ml-1 text-xs">days</span></p><div><p className="font-semibold">Default for new payment agreements</p><p className="mt-1 text-sm text-primary-foreground/75">{defaultPeriod.name}</p></div></div>}{error && <p className="mt-5 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-5 divide-y overflow-hidden rounded-lg border">{periods.map((period) => <article className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${period.isActive ? "" : "bg-surface-subtle text-muted-foreground"}`} key={period.id}><span className="grid size-16 shrink-0 place-items-center rounded-md bg-surface-muted"><span className="text-center"><strong className="block text-2xl">{period.days}</strong><span className="text-xs">days</span></span></span><div className="min-w-0 flex-1"><p className="font-semibold">{period.name}{period.isDefault && <span className="ml-2 inline-flex rounded-full bg-success/10 px-2 py-1 text-xs text-success">Default</span>}</p><p className="mt-2 text-sm text-muted-foreground">{period.description || "Reusable payment extension for future villa payment agreements."}</p></div><span className={`text-xs font-semibold ${period.isActive ? "text-success" : "text-muted-foreground"}`}>{period.isActive ? "Active" : "Disabled"}</span><div className="flex flex-wrap gap-2"><Button disabled={busyId === period.id} onClick={() => setEditor({ mode: "edit", period })} size="sm" variant="ghost">Edit</Button>{period.isActive ? <Button disabled={busyId === period.id} onClick={() => void changeStatus(period)} size="sm" variant="ghost">Disable</Button> : <Tooltip><TooltipTrigger asChild><Button disabled={busyId === period.id} onClick={() => void changeStatus(period)} size="sm" variant="ghost">Enable</Button></TooltipTrigger><TooltipContent>Click &quot;Enable&quot; to activate this grace period.</TooltipContent></Tooltip>}<Button className="text-danger hover:text-danger" disabled={busyId === period.id} onClick={() => setDeleteTarget(period)} size="sm" variant="ghost">Delete</Button></div></article>)}</div></section>{editor && <GracePeriodFormDialog key={editor.mode === "edit" ? editor.period.id : "new-grace-period"} onClose={() => setEditor(null)} onSaved={saveSettings} period={editor.mode === "edit" ? editor.period : null} />}{deleteTarget && <DeleteGracePeriodDialog onClose={() => setDeleteTarget(null)} onDeleted={(settings) => { setDeleteTarget(null); onSaved({ ...database, settings }, "Grace period deleted successfully."); }} period={deleteTarget} />}</TooltipProvider>;
}
