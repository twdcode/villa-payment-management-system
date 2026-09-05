"use client";

import { Bell, CalendarDays, ChevronRight, Clock3, FileClock, Plus, Settings2, Trash2, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/ui/toast";
import { GracePeriodsPanel } from "@/components/settings/grace-periods-panel";
import { ReminderTemplatesPanel } from "@/components/settings/reminder-templates-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { UserAccessPanel } from "@/components/settings/user-access-panel";
import { DEFAULT_PAYMENT_SCHEDULE_STAGES } from "@/lib/config/defaults";
import type { InterestTerms, MockDatabase, PaymentScheduleDefaultStage } from "@/lib/domain/types";
import { updateApplicationSettingsAction, updateInterestDefaultsAction, updateProjectPaymentScheduleDefaultsAction } from "@/lib/actions/settings";
import { errorMessage } from "@/lib/errors";
import { numberField } from "@/lib/forms/number-field";
import { percentToRate, rateToPercent } from "@/lib/domain/rate";
import { useCurrentUser } from "@/components/auth/current-user-provider";


type Section = "application" | "users" | "templates" | "grace" | "interest" | "schedule";

const applicationSchema = z.object({ companyName: z.string().trim().min(2, "Company name must contain at least two characters."), dateFormat: z.string().min(1, "Select a date format."), replyToEmail: z.union([z.literal(""), z.email("Enter a valid reply-to email address.")]) });
const scheduleStageSchema = z.object({ stage: z.string().trim().min(1, "Stage name is required."), gracePeriodDays: numberField({ required: "Enter the grace days.", integer: true, min: 0, minMessage: "Grace days cannot be negative." }), deliverables: z.string() });
const interestSchema = z.object({
  monthlyRate: numberField({ required: "Enter the monthly rate.", min: 0, max: 100, maxMessage: "Monthly rate cannot exceed 100%." }),
  gracePeriodDays: numberField({ required: "Enter the grace period in days.", integer: true, min: 0 }),
  proRataDivisor: numberField({ required: "Enter the pro-rata day divisor.", integer: true, min: 1, minMessage: "Pro-rata day divisor must be at least 1." }),
  interestStart: z.enum(["after_grace", "from_due_date"]),
  allocationOrder: z.enum(["interest_first", "principal_first"]),
  reminderDaysAfterDue: numberField({ required: "Enter the first reminder day.", integer: true, min: 0 }),
  secondReminderDaysAfterDue: numberField({ required: "Enter the second reminder day.", integer: true, min: 0 }),
  finalNoticeDaysAfterDue: numberField({ required: "Enter the final notice day.", integer: true, min: 0 }),
}).refine((value) => value.reminderDaysAfterDue <= value.secondReminderDaysAfterDue && value.secondReminderDaysAfterDue <= value.finalNoticeDaysAfterDue, { message: "Reminder days must be in chronological order.", path: ["reminderDaysAfterDue"] });

const sectionItems: Array<{ id: Section; label: string; description: string; icon: typeof Settings2 }> = [
  { id: "application", label: "Application", description: "Company and region", icon: Settings2 },
  { id: "users", label: "User access", description: "People, roles and status", icon: UsersRound },
  { id: "templates", label: "Reminder templates", description: "Customer email messages", icon: Bell },
  { id: "grace", label: "Grace periods", description: "Reusable payment rules", icon: CalendarDays },
  { id: "interest", label: "Interest defaults", description: "New agreement terms", icon: Clock3 },
  { id: "schedule", label: "Payment schedule", description: "Project stage defaults", icon: FileClock },
];

function SettingsNavigation({ active, onChange }: { active: Section; onChange: (section: Section) => void }) {
  return <aside className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-surface p-4 min-[1360px]:sticky min-[1360px]:top-6 min-[1360px]:self-start">
    <div className="flex items-center gap-3 border-b px-2 pb-4"><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><Settings2 className="size-5" /></span><div><p className="font-semibold">Workspace settings</p><p className="mt-1 text-xs text-muted-foreground">Super Admin controls</p></div></div>
    <nav aria-label="Settings sections" className="mt-3 flex w-full max-w-full gap-2 overflow-x-auto pb-1 min-[1360px]:block min-[1360px]:space-y-1 min-[1360px]:overflow-visible">
      {sectionItems.map((item) => { const Icon = item.icon; return <button aria-current={active === item.id ? "page" : undefined} className={`flex min-w-56 items-center gap-3 rounded-md px-3 py-3 text-left transition-colors min-[1360px]:w-full ${active === item.id ? "bg-surface-muted" : "hover:bg-surface-subtle"}`} key={item.id} onClick={() => onChange(item.id)} type="button"><Icon className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-muted-foreground">{item.description}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button>; })}
    </nav>
  </aside>;
}

function PanelHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-2xl font-medium">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>{action}</header>;
}

function ApplicationPanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const [form, setForm] = useState({ companyName: database.settings.companyName, dateFormat: database.settings.dateFormat, replyToEmail: database.settings.replyToEmail ?? "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = applicationSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the application settings."); return; } setSaving(true); setError(""); try { const settings = await updateApplicationSettingsAction(parsed.data); onSaved({ ...database, settings }, "Application settings saved successfully."); } catch (reason) { setError(errorMessage(reason, "Unable to save application settings.")); } finally { setSaving(false); } }
  return <section className="rounded-lg border bg-surface p-5 sm:p-7"><PanelHeading description="Company and regional preferences used across the workspace" title="Application settings" /><form className="mt-6" onSubmit={submit}><label className="block text-sm font-semibold text-muted-foreground">Company name<Input className="mt-2" onChange={(event) => setForm({ ...form, companyName: event.target.value })} value={form.companyName} /></label><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Currency<Input className="mt-2 bg-surface-muted" disabled value="LKR" /></label><label className="text-sm font-semibold text-muted-foreground">Date format<Select onValueChange={(next) => setForm({ ...form, dateFormat: next })} value={form.dateFormat}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dd MMM yyyy">Day Month Year</SelectItem><SelectItem value="yyyy/MM/dd">Year/Month/Date</SelectItem><SelectItem value="dd/MM/yyyy">Day/Month/Year</SelectItem></SelectContent></Select></label></div><label className="mt-5 block text-sm font-semibold text-muted-foreground">Reminder reply-to address<Input className="mt-2" onChange={(event) => setForm({ ...form, replyToEmail: event.target.value })} placeholder="accounts@yourcompany.com" type="email" value={form.replyToEmail} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Customers replying to a payment reminder reach this mailbox, not the sending address.</span></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-6 flex justify-end"><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save settings"}</Button></div></form></section>;
}

function InterestPanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const current = database.settings.defaultInterestTerms;
  const [enabled, setEnabled] = useState(database.settings.defaultChargeLatePaymentInterest);
  // Numeric fields are held as strings so a cleared box stays empty instead of snapping
  // back to "0" and prefixing the next keystroke — see NumberInput. `interestSchema`
  // converts them and rejects blanks on submit.
  const [form, setForm] = useState({
    ...current,
    monthlyRate: String(rateToPercent(current.monthlyRate)),
    gracePeriodDays: String(current.gracePeriodDays),
    proRataDivisor: String(current.proRataDivisor),
    reminderDaysAfterDue: String(current.reminderDaysAfterDue),
    secondReminderDaysAfterDue: String(current.secondReminderDaysAfterDue),
    finalNoticeDaysAfterDue: String(current.finalNoticeDaysAfterDue),
  });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = interestSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the interest defaults."); return; } const terms: InterestTerms = { ...parsed.data, monthlyRate: percentToRate(parsed.data.monthlyRate) }; setSaving(true); setError(""); try { const settings = await updateInterestDefaultsAction({ defaultChargeLatePaymentInterest: enabled, defaultInterestTerms: terms }); onSaved({ ...database, settings }, "Interest defaults saved successfully."); } catch (reason) { setError(errorMessage(reason, "Unable to save interest defaults.")); } finally { setSaving(false); } }
  // `monthlyRate` takes a decimal, so it keeps a plain text input that also allows ".";
  // the rest are whole-number counts and use NumberInput's digits-only handling.
  const numericField = (label: string, key: "monthlyRate" | "gracePeriodDays" | "proRataDivisor" | "reminderDaysAfterDue" | "secondReminderDaysAfterDue" | "finalNoticeDaysAfterDue") => <label className="text-sm font-semibold text-muted-foreground" key={key}>{label}{key === "monthlyRate"
    ? <Input className="mt-2" inputMode="decimal" onChange={(event) => setForm({ ...form, monthlyRate: event.target.value.replace(/[^0-9.]/g, "") })} value={form.monthlyRate} />
    : <NumberInput className="mt-2" onChange={(next) => setForm({ ...form, [key]: next })} value={form[key]} />}</label>;
  return <section className="rounded-lg border bg-surface p-5 sm:p-7"><PanelHeading description="Copied into future agreements; existing villas and customers remain unchanged" title="New-agreement interest defaults" /><form className="mt-5" onSubmit={submit}><label className="flex items-center gap-3 rounded-md bg-surface-muted p-4 font-semibold"><input checked={enabled} className="size-5 accent-primary" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />Charge late-payment interest</label><div className="mt-5 grid gap-5 sm:grid-cols-2">{numericField("Monthly rate (%)", "monthlyRate")}{numericField("Grace period (days)", "gracePeriodDays")}{numericField("Pro-rata day divisor", "proRataDivisor")}<label className="text-sm font-semibold text-muted-foreground">Interest start<Select onValueChange={(next) => setForm({ ...form, interestStart: next as InterestTerms["interestStart"] })} value={form.interestStart}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="after_grace">After grace</SelectItem><SelectItem value="from_due_date">From due date</SelectItem></SelectContent></Select></label>{numericField("First reminder day", "reminderDaysAfterDue")}{numericField("Second reminder day", "secondReminderDaysAfterDue")}{numericField("Final notice day", "finalNoticeDaysAfterDue")}<label className="text-sm font-semibold text-muted-foreground">Collection allocation<Select onValueChange={(next) => setForm({ ...form, allocationOrder: next as InterestTerms["allocationOrder"] })} value={form.allocationOrder}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="interest_first">Interest first</SelectItem><SelectItem value="principal_first">Principal first</SelectItem></SelectContent></Select></label></div><div className="mt-5 rounded-md border border-warning/35 bg-warning/10 p-4 text-sm text-warning"><p className="font-semibold">Grace period connection</p><p className="mt-1">Saving here updates the default grace-period rule shown in Settings.</p></div>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-6 flex justify-end"><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save defaults"}</Button></div></form></section>;
}

function AddScheduleStageDialog({ defaultGraceDays, onClose, onSave }: { defaultGraceDays: number; onClose: () => void; onSave: (stage: PaymentScheduleDefaultStage) => void }) {
  const [form, setForm] = useState({ stage: "", gracePeriodDays: String(defaultGraceDays), deliverables: "" });
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = scheduleStageSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the payment stage details.");
      return;
    }
    onSave({ id: crypto.randomUUID(), stage: parsed.data.stage, gracePeriodDays: parsed.data.gracePeriodDays, ...(parsed.data.deliverables.trim() ? { deliverables: parsed.data.deliverables.trim() } : {}) });
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><FileClock className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-2xl font-medium">Add payment stage</DialogTitle><DialogDescription className="mt-2">Add a reusable stage to the selected project&apos;s schedule defaults.</DialogDescription></div><Button aria-label="Close add stage form" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="text-sm font-semibold text-muted-foreground"><span className="flex items-center justify-between gap-3"><span>Stage name</span><span className="text-xs text-danger">Required</span></span><Input autoFocus className="mt-2" onChange={(event) => { setForm({ ...form, stage: event.target.value }); setError(""); }} placeholder="e.g. Foundation complete" required value={form.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Grace days<NumberInput className="mt-2" onChange={(next) => { setForm({ ...form, gracePeriodDays: next }); setError(""); }} required value={form.gracePeriodDays} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Stage deliverables<textarea className="mt-2 min-h-28 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setForm({ ...form, deliverables: event.target.value })} placeholder="Construction work or documents delivered at this stage..." value={form.deliverables} /></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button type="submit">Save stage</Button></footer></form></DialogContent></Dialog>;
}

function SchedulePanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  // Read here, not in the top-level page component: `WorkspaceSettingsPageClient`
  // returns `<AppShell>...</AppShell>`, and its own JSX (including this component,
  // built as one of AppShell's children) is constructed in that same render pass —
  // before `AppShell` has wrapped anything in `CurrentUserProvider`. A hook call there
  // reads the *outer* (unset) context and silently returns null forever. `SchedulePanel`
  // itself, rendered as a child by the time React actually calls this function, sees the
  // provider correctly.
  const isSuperAdmin = useCurrentUser()?.role === "super_admin";
  const [projectId, setProjectId] = useState(database.projects[0]?.id ?? "");
  const defaultsFor = (id: string) => database.settings.projectPaymentScheduleDefaults.find((item) => item.projectId === id)?.stages ?? DEFAULT_PAYMENT_SCHEDULE_STAGES.map((stage, index) => ({ id: `${id}-default-stage-${index + 1}`, stage, gracePeriodDays: database.settings.defaultInterestTerms.gracePeriodDays }));
  const [stages, setStages] = useState<PaymentScheduleDefaultStage[]>(() => defaultsFor(projectId));
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  function changeProject(id: string) { setProjectId(id); setStages(defaultsFor(id).map((stage) => ({ ...stage }))); setError(""); }
  function update(id: string, patch: Partial<PaymentScheduleDefaultStage>) { setStages(stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage)); }
  async function save() { if (!projectId) return; setSaving(true); setError(""); try { const settings = await updateProjectPaymentScheduleDefaultsAction({ projectId, stages }); onSaved({ ...database, settings }, "Payment schedule defaults saved successfully."); } catch (reason) { setError(errorMessage(reason, "Unable to save payment schedule defaults.")); } finally { setSaving(false); } }
  const addStageAction = isSuperAdmin ? <Button onClick={() => setStageDialogOpen(true)}><Plus className="size-4" />Add stage</Button> : undefined;
  return <section className="overflow-hidden rounded-lg border bg-surface"><div className="p-5 sm:p-7"><PanelHeading action={addStageAction} description="Stage names, deliverables and grace days copied into new villas for the selected project" title="Payment schedule defaults" /><label className="mt-5 block max-w-md text-sm font-semibold text-muted-foreground">Project<Select onValueChange={changeProject} value={projectId}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></label></div><div className="max-h-[58dvh] divide-y overflow-y-auto border-y">{stages.map((stage, index) => <article className="p-5 sm:p-7" key={stage.id}><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">{index + 1}. {stage.stage || "New payment stage"}</h3><Button aria-label={`Remove payment stage ${index + 1}`} disabled={stages.length === 1} onClick={() => setStages(stages.filter((item) => item.id !== stage.id))} size="sm" variant="ghost"><Trash2 className="size-4 text-danger" />Remove</Button></div><div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="text-sm font-semibold text-muted-foreground">Stage name<Input className="mt-2" onChange={(event) => update(stage.id, { stage: event.target.value })} value={stage.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Grace days<NumberInput className="mt-2" onChange={(next) => update(stage.id, { gracePeriodDays: next === "" ? 0 : Number(next) })} value={String(stage.gracePeriodDays)} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Stage deliverables<textarea className="mt-2 min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm" onChange={(event) => update(stage.id, { deliverables: event.target.value })} placeholder="Construction work or documents delivered at this stage..." value={stage.deliverables ?? ""} /></label></article>)}</div><footer className="sticky bottom-0 flex flex-col gap-3 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-sm text-muted-foreground">Changes apply only to new villas. Existing villa schedules are unchanged.</p><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save schedule"}</Button></footer>{error && <p className="mx-5 mb-5 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}{stageDialogOpen && isSuperAdmin && <AddScheduleStageDialog defaultGraceDays={database.settings.defaultInterestTerms.gracePeriodDays} onClose={() => setStageDialogOpen(false)} onSave={(stage) => { setStages([...stages, stage]); setStageDialogOpen(false); }} />}</section>;
}

/** `initialData`: fetched server-side by `app/settings/page.tsx`. See dashboard-page-client.tsx for why it stays optional. */
export function WorkspaceSettingsPageClient({ database: initialDatabase }: { database: MockDatabase }) {
  return (
    <AppShell active="Settings">
      <WorkspaceSettingsPageBody database={initialDatabase} />
    </AppShell>
  );
}

/** Split so `useToast()` resolves under AppShell's provider — see ProjectsPageBody. */
function WorkspaceSettingsPageBody({ database: initialDatabase }: { database: MockDatabase }) {
  const [database, setDatabase] = useState(initialDatabase);
  const [section, setSection] = useState<Section>("application");
  const { toast } = useToast();
  const panel = useMemo(() => {
    const onSaved = (nextDatabase: MockDatabase, message: string) => { setDatabase(nextDatabase); toast(message); };
    if (section === "application") return <ApplicationPanel database={database} onSaved={onSaved} />;
    if (section === "users") return <UserAccessPanel database={database} onSaved={onSaved} />;
    if (section === "templates") return <ReminderTemplatesPanel database={database} onSaved={onSaved} />;
    if (section === "grace") return <GracePeriodsPanel database={database} onSaved={onSaved} />;
    if (section === "interest") return <InterestPanel database={database} onSaved={onSaved} />;
    return <SchedulePanel database={database} onSaved={onSaved} />;
  }, [database, section, toast]);
  return <><div><h1 className="text-3xl font-semibold">Settings</h1><p className="mt-2 text-muted-foreground">Company and workspace preferences.</p></div><div className="mt-8 grid min-w-0 max-w-full gap-6 min-[1360px]:grid-cols-[20rem_minmax(0,1fr)]"><SettingsNavigation active={section} onChange={setSection} />{panel}</div></>;
}
