"use client";

import { Bell, CalendarDays, CheckCircle2, ChevronRight, Clock3, FileClock, Plus, Settings2, Trash2, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { GracePeriodsPanel } from "@/components/settings/grace-periods-panel";
import { ReminderTemplatesPanel } from "@/components/settings/reminder-templates-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAccessPanel } from "@/components/settings/user-access-panel";
import { DEFAULT_PAYMENT_SCHEDULE_STAGES } from "@/lib/config/demo";
import type { InterestTerms, MockDatabase, PaymentScheduleDefaultStage } from "@/lib/domain/types";
import { mockRepository } from "@/lib/repositories/local-storage-repository";

type Section = "application" | "users" | "templates" | "grace" | "interest" | "schedule";

const applicationSchema = z.object({ companyName: z.string().trim().min(2, "Company name must contain at least two characters."), dateFormat: z.string().min(1, "Select a date format.") });
const interestSchema = z.object({
  monthlyRate: z.coerce.number().min(0).max(100),
  gracePeriodDays: z.coerce.number().int().min(0),
  proRataDivisor: z.coerce.number().int().min(1),
  interestStart: z.enum(["after_grace", "from_due_date"]),
  allocationOrder: z.enum(["interest_first", "principal_first"]),
  reminderDaysAfterDue: z.coerce.number().int().min(0),
  secondReminderDaysAfterDue: z.coerce.number().int().min(0),
  finalNoticeDaysAfterDue: z.coerce.number().int().min(0),
}).refine((value) => value.reminderDaysAfterDue <= value.secondReminderDaysAfterDue && value.secondReminderDaysAfterDue <= value.finalNoticeDaysAfterDue, { message: "Reminder days must be in chronological order.", path: ["reminderDaysAfterDue"] });

const sectionItems: Array<{ id: Section; label: string; description: string; icon: typeof Settings2 }> = [
  { id: "application", label: "Application", description: "Company and region", icon: Settings2 },
  { id: "users", label: "User access", description: "People, roles and status", icon: UsersRound },
  { id: "templates", label: "Reminder templates", description: "Customer email messages", icon: Bell },
  { id: "grace", label: "Grace periods", description: "Reusable payment rules", icon: CalendarDays },
  { id: "interest", label: "Interest defaults", description: "New agreement terms", icon: Clock3 },
  { id: "schedule", label: "Payment schedule", description: "Project stage defaults", icon: FileClock },
];

function SuccessAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return <div className="fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-lg items-center justify-between gap-3 rounded-lg border border-success bg-success px-4 py-4 text-sm font-semibold text-white shadow-lg" role="status"><span className="flex items-center gap-3"><CheckCircle2 className="size-5 shrink-0" />{message}</span><button aria-label="Dismiss success message" className="rounded-md p-1 hover:bg-white/15" onClick={onDismiss}><X className="size-4" /></button></div>;
}

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
  const [form, setForm] = useState({ companyName: database.settings.companyName, dateFormat: database.settings.dateFormat });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = applicationSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the application settings."); return; } setSaving(true); setError(""); try { const settings = await mockRepository.updateApplicationSettings(parsed.data); onSaved({ ...database, settings }, "Application settings saved successfully."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save application settings."); } finally { setSaving(false); } }
  return <section className="rounded-lg border bg-surface p-5 sm:p-7"><PanelHeading description="Company and regional preferences used across the workspace" title="Application settings" /><form className="mt-6" onSubmit={submit}><label className="block text-sm font-semibold text-muted-foreground">Company name<Input className="mt-2" onChange={(event) => setForm({ ...form, companyName: event.target.value })} value={form.companyName} /></label><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Currency<Input className="mt-2 bg-surface-muted" disabled value="LKR" /></label><label className="text-sm font-semibold text-muted-foreground">Date format<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => setForm({ ...form, dateFormat: event.target.value })} value={form.dateFormat}><option value="dd MMM yyyy">Day Month Year</option><option value="yyyy/MM/dd">Year/Month/Date</option><option value="dd/MM/yyyy">Day/Month/Year</option></select></label></div>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-6 flex justify-end"><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save settings"}</Button></div></form></section>;
}

function InterestPanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const current = database.settings.defaultInterestTerms;
  const [enabled, setEnabled] = useState(database.settings.defaultChargeLatePaymentInterest);
  const [form, setForm] = useState({ ...current, monthlyRate: current.monthlyRate * 100 });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const parsed = interestSchema.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the interest defaults."); return; } const terms: InterestTerms = { ...parsed.data, monthlyRate: parsed.data.monthlyRate / 100 }; setSaving(true); setError(""); try { const settings = await mockRepository.updateInterestDefaults({ defaultChargeLatePaymentInterest: enabled, defaultInterestTerms: terms }); onSaved({ ...database, settings }, "Interest defaults saved successfully."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save interest defaults."); } finally { setSaving(false); } }
  const numericField = (label: string, key: "monthlyRate" | "gracePeriodDays" | "proRataDivisor" | "reminderDaysAfterDue" | "secondReminderDaysAfterDue" | "finalNoticeDaysAfterDue") => <label className="text-sm font-semibold text-muted-foreground">{label}<Input className="mt-2" min="0" onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} step={key === "monthlyRate" ? "0.1" : "1"} type="number" value={form[key]} /></label>;
  return <section className="rounded-lg border bg-surface p-5 sm:p-7"><PanelHeading description="Copied into future agreements; existing villas and customers remain unchanged" title="New-agreement interest defaults" /><form className="mt-5" onSubmit={submit}><label className="flex items-center gap-3 rounded-md bg-surface-muted p-4 font-semibold"><input checked={enabled} className="size-5 accent-primary" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />Charge late-payment interest</label><div className="mt-5 grid gap-5 sm:grid-cols-2">{numericField("Monthly rate (%)", "monthlyRate")}{numericField("Grace period (days)", "gracePeriodDays")}{numericField("Pro-rata day divisor", "proRataDivisor")}<label className="text-sm font-semibold text-muted-foreground">Interest start<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, interestStart: event.target.value as InterestTerms["interestStart"] })} value={form.interestStart}><option value="after_grace">After grace</option><option value="from_due_date">From due date</option></select></label>{numericField("First reminder day", "reminderDaysAfterDue")}{numericField("Second reminder day", "secondReminderDaysAfterDue")}{numericField("Final notice day", "finalNoticeDaysAfterDue")}<label className="text-sm font-semibold text-muted-foreground">Collection allocation<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, allocationOrder: event.target.value as InterestTerms["allocationOrder"] })} value={form.allocationOrder}><option value="interest_first">Interest first</option><option value="principal_first">Principal first</option></select></label></div><div className="mt-5 rounded-md border border-warning/35 bg-warning/10 p-4 text-sm text-warning"><p className="font-semibold">Grace period connection</p><p className="mt-1">Saving here updates the default grace-period rule shown in Settings.</p></div>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<div className="mt-6 flex justify-end"><Button disabled={saving} type="submit">{saving ? "Saving..." : "Save defaults"}</Button></div></form></section>;
}

function SchedulePanel({ database, onSaved }: { database: MockDatabase; onSaved: (database: MockDatabase, message: string) => void }) {
  const [projectId, setProjectId] = useState(database.projects[0]?.id ?? "");
  const defaultsFor = (id: string) => database.settings.projectPaymentScheduleDefaults.find((item) => item.projectId === id)?.stages ?? DEFAULT_PAYMENT_SCHEDULE_STAGES.map((stage, index) => ({ id: `${id}-default-stage-${index + 1}`, stage, gracePeriodDays: database.settings.defaultInterestTerms.gracePeriodDays }));
  const [stages, setStages] = useState<PaymentScheduleDefaultStage[]>(() => defaultsFor(projectId));
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  function changeProject(id: string) { setProjectId(id); setStages(defaultsFor(id).map((stage) => ({ ...stage }))); setError(""); }
  function update(id: string, patch: Partial<PaymentScheduleDefaultStage>) { setStages(stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage)); }
  async function save() { if (!projectId) return; setSaving(true); setError(""); try { const settings = await mockRepository.updateProjectPaymentScheduleDefaults({ projectId, stages }); onSaved({ ...database, settings }, "Payment schedule defaults saved successfully."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save payment schedule defaults."); } finally { setSaving(false); } }
  return <section className="overflow-hidden rounded-lg border bg-surface"><div className="p-5 sm:p-7"><PanelHeading action={<Button onClick={() => setStages([...stages, { id: crypto.randomUUID(), stage: "", deliverables: "", gracePeriodDays: database.settings.defaultInterestTerms.gracePeriodDays }])}><Plus className="size-4" />Add stage</Button>} description="Stage names, deliverables and grace days copied into new villas for the selected project" title="Payment schedule defaults" /><label className="mt-5 block max-w-md text-sm font-semibold text-muted-foreground">Project<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground" onChange={(event) => changeProject(event.target.value)} value={projectId}>{database.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><div className="max-h-[58dvh] divide-y overflow-y-auto border-y">{stages.map((stage, index) => <article className="p-5 sm:p-7" key={stage.id}><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">{index + 1}. {stage.stage || "New payment stage"}</h3><Button aria-label={`Remove payment stage ${index + 1}`} disabled={stages.length === 1} onClick={() => setStages(stages.filter((item) => item.id !== stage.id))} size="sm" variant="ghost"><Trash2 className="size-4 text-danger" />Remove</Button></div><div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="text-sm font-semibold text-muted-foreground">Stage name<Input className="mt-2" onChange={(event) => update(stage.id, { stage: event.target.value })} value={stage.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Grace days<Input className="mt-2" min="0" onChange={(event) => update(stage.id, { gracePeriodDays: Number(event.target.value) })} type="number" value={stage.gracePeriodDays} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Stage deliverables<textarea className="mt-2 min-h-24 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm" onChange={(event) => update(stage.id, { deliverables: event.target.value })} placeholder="Construction work or documents delivered at this stage..." value={stage.deliverables ?? ""} /></label></article>)}</div><footer className="sticky bottom-0 flex flex-col gap-3 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-sm text-muted-foreground">Changes apply only to new villas. Existing villa schedules are unchanged.</p><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save schedule"}</Button></footer>{error && <p className="mx-5 mb-5 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}</section>;
}

export function WorkspaceSettingsPageClient() {
  const [database, setDatabase] = useState<MockDatabase | null>(null);
  const [section, setSection] = useState<Section>("application");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void mockRepository.getDatabase().then(setDatabase).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load workspace settings.")); }, []);
  const panel = useMemo(() => {
    if (!database) return null;
    const onSaved = (nextDatabase: MockDatabase, message: string) => { setDatabase(nextDatabase); setNotice(message); };
    if (section === "application") return <ApplicationPanel database={database} onSaved={onSaved} />;
    if (section === "users") return <UserAccessPanel database={database} onSaved={onSaved} />;
    if (section === "templates") return <ReminderTemplatesPanel database={database} onSaved={onSaved} />;
    if (section === "grace") return <GracePeriodsPanel database={database} onSaved={onSaved} />;
    if (section === "interest") return <InterestPanel database={database} onSaved={onSaved} />;
    return <SchedulePanel database={database} onSaved={onSaved} />;
  }, [database, section]);
  return <AppShell active="Settings"><SuccessAlert message={notice} onDismiss={() => setNotice("")} /><div><h1 className="text-3xl font-semibold">Settings</h1><p className="mt-2 text-muted-foreground">Company and workspace preferences.</p></div>{error ? <p className="mt-6 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p> : !database ? <p className="mt-6 text-sm text-muted-foreground">Loading settings...</p> : <div className="mt-8 grid min-w-0 max-w-full gap-6 min-[1360px]:grid-cols-[20rem_minmax(0,1fr)]"><SettingsNavigation active={section} onChange={setSection} />{panel}</div>}</AppShell>;
}
