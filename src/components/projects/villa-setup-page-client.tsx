"use client";

import { CalendarDays, Check, CheckCircle2, CircleUserRound, Clock3, Home, Plus, Search, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_PAYMENT_SCHEDULE_STAGES } from "@/lib/config/defaults";
import type { Customer, InterestTerms, MockDatabase, VillaOperationalStatus } from "@/lib/domain/types";
import { villaStatusLabels } from "@/lib/domain/status-labels";
import type { PaymentScheduleInput, VillaSetupInput } from "@/lib/repositories/contracts";
import { completeVillaSetupAction } from "@/lib/actions/villas";
import { errorMessage } from "@/lib/errors";
import { percentToRate, rateToPercent } from "@/lib/domain/rate";


type Step = 1 | 2 | 3 | 4;
type CustomerMode = "unassigned" | "existing" | "new";
type ScheduleDraft = PaymentScheduleInput & { id: string };

const defaultCustomer = { fullName: "", email: "", phone: "" };

function stepName(step: Step) {
  return ["Villa details", "Customer", "Finance", "Review"][step - 1];
}

function numberFromDraft(villaId: string) {
  return villaId.startsWith("draft-") ? villaId.replace("draft-", "") : "";
}

function StepProgress({ step }: { step: Step }) {
  return <ol className="mt-10 grid grid-cols-4 gap-2" aria-label="Villa setup progress">{([1, 2, 3, 4] as Step[]).map((item) => <li className="relative flex flex-col items-center text-center" key={item}><span className={`z-10 grid size-10 place-items-center rounded-full border text-sm font-semibold ${item < step ? "border-accent bg-surface-muted text-primary" : item === step ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>{item < step ? <Check className="size-4" /> : item}</span>{item < 4 && <span className="absolute left-1/2 top-5 -z-0 h-px w-full bg-border" />}<span className={`mt-3 text-xs font-semibold sm:text-sm ${item === step ? "text-foreground" : "text-muted-foreground"}`}>{stepName(item)}</span></li>)}</ol>;
}

function ChoiceCard({ active, icon: Icon, title, description, onClick }: { active: boolean; icon: typeof Home; title: string; description: string; onClick: () => void }) {
  return <button className={`flex min-h-24 w-full items-center gap-4 rounded-2xl border p-5 text-left transition-colors ${active ? "border-accent bg-surface-subtle" : "bg-surface hover:bg-surface-subtle"}`} onClick={onClick} type="button"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-muted"><Icon className="size-6 text-primary" /></span><span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span></button>;
}

function CustomerPicker({ customers, selectedId, onChange, onAddCustomer }: { customers: Customer[]; selectedId: string; onChange: (id: string) => void; onAddCustomer: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const matches = customers.filter((customer) => `${customer.fullName} ${customer.email} ${customer.phone}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = customers.find((customer) => customer.id === selectedId);
  return <div className="relative"><label className="text-sm font-semibold text-muted-foreground" htmlFor="customer-search">Customer</label><div className="mt-2"><Input id="customer-search" onChange={(event) => { setSearch(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search customer by name, email, or phone" value={open ? search : selected?.fullName ?? ""} /><Search className="pointer-events-none absolute right-4 top-11 size-5 text-muted-foreground" /></div>{open && <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border bg-surface p-2 shadow-lg"><button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-primary hover:bg-surface-muted" onClick={() => { onAddCustomer(); setOpen(false); }} type="button"><UserPlus className="size-5" />Add new customer</button><div className="my-1 border-t" />{matches.length ? matches.map((customer) => <button className="w-full rounded-lg px-3 py-3 text-left hover:bg-surface-muted" key={customer.id} onClick={() => { onChange(customer.id); setSearch(""); setOpen(false); }} type="button"><span className="block text-sm font-semibold">{customer.fullName}</span><span className="mt-1 block text-xs text-muted-foreground">{customer.email} <span aria-hidden="true">·</span> {customer.phone}</span></button>) : <p className="px-3 py-4 text-sm text-muted-foreground">No customers match this search.</p>}</div>}</div>;
}

function ScheduleEditor({ schedule, setSchedule, defaultGrace }: { schedule: ScheduleDraft[]; setSchedule: (schedule: ScheduleDraft[]) => void; defaultGrace: number }) {
  function update(id: string, patch: Partial<ScheduleDraft>) { setSchedule(schedule.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  return <div className="mt-5 overflow-hidden rounded-2xl border bg-surface"><div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Payment schedule</h3><p className="mt-1 text-sm text-muted-foreground">Stages must total the villa value.</p></div><Button onClick={() => setSchedule([...schedule, { id: crypto.randomUUID(), stage: "", dueDate: "", principalAmount: 0, gracePeriodDays: defaultGrace }])} size="sm" type="button" variant="outline"><Plus className="size-4" />Add stage</Button></div><div className="divide-y">{schedule.map((item, index) => <div className="grid gap-3 p-5 md:grid-cols-[1.2fr_1fr_1fr_8rem_auto]" key={item.id}><label className="text-sm font-semibold text-muted-foreground">Stage<Input className="mt-2" onChange={(event) => update(item.id, { stage: event.target.value })} placeholder="e.g. Reservation" value={item.stage} /></label><label className="text-sm font-semibold text-muted-foreground">Due date<Input className="mt-2" onChange={(event) => update(item.id, { dueDate: event.target.value })} type="date" value={item.dueDate} /></label><label className="text-sm font-semibold text-muted-foreground">Principal (LKR)<Input className="mt-2" min="0" onChange={(event) => update(item.id, { principalAmount: Number(event.target.value) })} type="number" value={item.principalAmount || ""} /></label><label className="text-sm font-semibold text-muted-foreground">Grace days<Input className="mt-2" min="0" onChange={(event) => update(item.id, { gracePeriodDays: Number(event.target.value) })} type="number" value={item.gracePeriodDays} /></label><Button aria-label={`Remove schedule stage ${index + 1}`} className="self-end" disabled={schedule.length === 1} onClick={() => setSchedule(schedule.filter((entry) => entry.id !== item.id))} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>)}</div></div>;
}

export function VillaSetupPageClient({ projectId, villaId, database }: { projectId: string; villaId: string; database: MockDatabase }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [number, setNumber] = useState(numberFromDraft(villaId));
  const [villaType, setVillaType] = useState("");
  const [value, setValue] = useState("");
  const [operationalStatus, setOperationalStatus] = useState<VillaOperationalStatus>("available");
  const [customerMode, setCustomerMode] = useState<CustomerMode>("unassigned");
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState(defaultCustomer);
  const [interestEnabled, setInterestEnabled] = useState(() => database.settings.defaultChargeLatePaymentInterest);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [interestTerms, setInterestTerms] = useState<Partial<InterestTerms>>(() => ({ ...database.settings.defaultInterestTerms }));
  const [schedule, setSchedule] = useState<ScheduleDraft[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProject = database.projects.find((project) => project.id === selectedProjectId) ?? null;
  const defaults = database.settings.defaultInterestTerms;
  const scheduleTotal = schedule.reduce((total, item) => total + item.principalAmount, 0);
  const scheduleMatchesValue = Number(value) > 0 && Math.abs(scheduleTotal - Number(value)) < 0.01;
  const scheduleIsComplete = scheduleEnabled && scheduleMatchesValue && schedule.length > 0 && schedule.every((item) => Boolean(item.stage.trim()) && Boolean(item.dueDate) && item.principalAmount > 0 && item.gracePeriodDays >= 0);
  const selectedCustomer = database.customers.find((customer) => customer.id === customerId) ?? null;

  function startSchedule() {
    const projectDefaults = database.settings.projectPaymentScheduleDefaults.find((item) => item.projectId === selectedProjectId)?.stages;
    if (!schedule.length) setSchedule((projectDefaults?.length ? projectDefaults : DEFAULT_PAYMENT_SCHEDULE_STAGES.map((stage) => ({ id: crypto.randomUUID(), stage, deliverables: "", gracePeriodDays: defaults.gracePeriodDays ?? 30 }))).map((item) => ({ id: crypto.randomUUID(), stage: item.stage, deliverables: item.deliverables, dueDate: "", principalAmount: 0, gracePeriodDays: item.gracePeriodDays })));
    setScheduleEnabled(true);
  }

  function changeProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSchedule([]);
    setScheduleEnabled(false);
  }

  function continueStep() {
    setError("");
    if (step === 1) {
      if (!selectedProjectId || !number.trim() || !villaType.trim() || Number(value) <= 0) { setError("Complete the required villa details before continuing."); return; }
    }
    if (step === 2 && customerMode === "existing" && !customerId) { setError("Select a customer or choose Keep unassigned."); return; }
    if (step === 2 && customerMode === "new" && (!newCustomer.fullName.trim() || !newCustomer.email.trim() || !newCustomer.phone.trim())) { setError("Complete the new customer details before continuing."); return; }
    setStep((current) => Math.min(4, current + 1) as Step);
  }

  async function saveVilla() {
    if (!selectedProject || !defaults) return;
    setError("");
    setSaving(true);
    const input: VillaSetupInput = { projectId: selectedProjectId, number: number.trim(), type: villaType.trim(), value: Number(value), operationalStatus, chargeLatePaymentInterest: interestEnabled, ...(customerMode === "existing" ? { customerId } : {}), ...(customerMode === "new" ? { newCustomer } : {}), ...(interestEnabled ? { interestTerms } : {}), ...(scheduleIsComplete ? { schedules: schedule.map((item) => ({ stage: item.stage, deliverables: item.deliverables, dueDate: item.dueDate, principalAmount: item.principalAmount, gracePeriodDays: item.gracePeriodDays })) } : {}) };
    try {
      const result = await completeVillaSetupAction(input);
      router.push(`/projects/${selectedProjectId}/villas/${result.villa.id}?created=1`);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to create the villa profile."));
    } finally { setSaving(false); }
  }

  if (!selectedProject) return <div className="grid min-h-screen place-items-center bg-background"><p className="rounded-xl border bg-surface px-6 py-5 text-sm font-semibold">Project not found.</p></div>;

  return <div className="min-h-screen bg-background"><main className="mx-auto w-full max-w-6xl px-5 pb-36 pt-9 sm:px-8 sm:pt-12"><div className="flex items-start justify-between gap-5"><div><span className="grid size-12 place-items-center rounded-xl bg-surface-muted"><Home className="size-6 text-primary" /></span><h1 className="mt-5 text-3xl font-medium">Set up a villa</h1><p className="mt-2 text-base text-muted-foreground">Only villa details are required. Customer and finance setup can be completed later.</p></div><Button aria-label="Close villa setup" onClick={() => router.push(`/projects/${projectId}/villas/${villaId}`)} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><StepProgress step={step} />
    <section className="mt-12 max-w-5xl"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">{step === 4 ? "Final step" : `Step ${step}${step > 1 ? " · Optional" : ""}`}</p>
      {step === 1 && <div className="mt-4"><h2 className="text-3xl font-medium">Villa details</h2><p className="mt-2 text-base text-muted-foreground">Choose the project and add the information used across the villa profile.</p><div className="mt-9 grid gap-6 md:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Project*<select className="mt-2 h-15 w-full rounded-xl border bg-surface px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => changeProject(event.target.value)} value={selectedProjectId}>{database.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-sm font-semibold text-muted-foreground">Villa number*<Input className="mt-2 h-15" onChange={(event) => setNumber(event.target.value)} value={number} /></label><label className="text-sm font-semibold text-muted-foreground">Villa type*<Input className="mt-2 h-15" onChange={(event) => setVillaType(event.target.value)} placeholder="e.g. Beachfront 4 Bed" value={villaType} /></label><label className="text-sm font-semibold text-muted-foreground">Villa value (LKR)*<Input className="mt-2 h-15" min="1" onChange={(event) => setValue(event.target.value)} type="number" value={value} /></label><label className="text-sm font-semibold text-muted-foreground md:max-w-[calc(50%-0.75rem)]">Status<sup>*</sup><select className="mt-2 h-15 w-full rounded-xl border bg-surface px-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setOperationalStatus(event.target.value as VillaOperationalStatus)} value={operationalStatus}>{Object.entries(villaStatusLabels).map(([statusValue, label]) => <option key={statusValue} value={statusValue}>{label}</option>)}</select></label></div></div>}
      {step === 2 && <div className="mt-4"><h2 className="text-3xl font-medium">Assign a customer</h2><p className="mt-2 text-base text-muted-foreground">Link an existing customer, add a new one, or keep the villa unassigned and finish this later.</p><div className="mt-8 grid gap-4 md:grid-cols-2"><ChoiceCard active={customerMode === "unassigned"} description="Best for an available villa or when the buyer is not confirmed." icon={Home} onClick={() => setCustomerMode("unassigned")} title="Keep unassigned" /><ChoiceCard active={customerMode === "existing" || customerMode === "new"} description="Connect the buyer to this villa profile now." icon={CircleUserRound} onClick={() => setCustomerMode("existing")} title="Assign a customer" /></div>{customerMode === "existing" && <div className="mt-6 max-w-xl"><CustomerPicker customers={database.customers} onAddCustomer={() => setCustomerMode("new")} onChange={setCustomerId} selectedId={customerId} /></div>}{customerMode === "new" && <div className="mt-6 grid max-w-3xl gap-5 md:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Customer name*<Input className="mt-2" onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} value={newCustomer.fullName} /></label><label className="text-sm font-semibold text-muted-foreground">Email*<Input className="mt-2" onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} type="email" value={newCustomer.email} /></label><label className="text-sm font-semibold text-muted-foreground">Phone*<Input className="mt-2" onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} value={newCustomer.phone} /></label><Button className="self-end justify-self-start" onClick={() => setCustomerMode("existing")} type="button" variant="ghost">Choose existing customer</Button></div>}<div className="mt-7 flex items-center gap-3 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-muted-foreground"><CheckCircle2 className="size-5 text-accent" />You can change the assigned customer later from the villa profile.</div></div>}
      {step === 3 && <div className="mt-4"><h2 className="text-3xl font-medium">Finance defaults</h2><p className="mt-2 text-base text-muted-foreground">Start with company defaults. You can add a payment schedule now or from the saved profile.</p><div className="mt-8 space-y-4"><ChoiceCard active={interestEnabled} description={`${rateToPercent(defaults.monthlyRate).toFixed(1)}% monthly · ${defaults.gracePeriodDays}-day grace · interest-first allocation`} icon={Clock3} onClick={() => { setInterestEnabled(!interestEnabled); if (!interestEnabled) setInterestTerms({ monthlyRate: defaults.monthlyRate, gracePeriodDays: defaults.gracePeriodDays, proRataDivisor: defaults.proRataDivisor, allocationOrder: defaults.allocationOrder, reminderDaysAfterDue: defaults.reminderDaysAfterDue, finalNoticeDaysAfterDue: defaults.finalNoticeDaysAfterDue }); }} title="Apply late-payment interest terms" /><ChoiceCard active={scheduleEnabled} description="Adds the standard eight construction stages. Add more stages whenever the information is available." icon={CalendarDays} onClick={() => scheduleEnabled ? setScheduleEnabled(false) : startSchedule()} title="Payment schedule" /></div>{interestEnabled && <div className="mt-5 grid gap-4 rounded-2xl border bg-surface p-5 sm:grid-cols-3"><label className="text-sm font-semibold text-muted-foreground">Monthly rate (%)<Input className="mt-2" min="0" onChange={(event) => setInterestTerms({ ...interestTerms, monthlyRate: percentToRate(Number(event.target.value)) })} step="0.1" type="number" value={rateToPercent(interestTerms.monthlyRate ?? defaults.monthlyRate).toString()} /></label><label className="text-sm font-semibold text-muted-foreground">Grace period (days)<Input className="mt-2" min="0" onChange={(event) => setInterestTerms({ ...interestTerms, gracePeriodDays: Number(event.target.value) })} type="number" value={interestTerms.gracePeriodDays ?? defaults.gracePeriodDays} /></label><label className="text-sm font-semibold text-muted-foreground">Pro-rata divisor<Input className="mt-2" min="1" onChange={(event) => setInterestTerms({ ...interestTerms, proRataDivisor: Number(event.target.value) })} type="number" value={interestTerms.proRataDivisor ?? defaults.proRataDivisor} /></label></div>}{scheduleEnabled && <ScheduleEditor defaultGrace={interestTerms.gracePeriodDays ?? defaults.gracePeriodDays} schedule={schedule} setSchedule={setSchedule} />}{scheduleEnabled && <p className={`mt-4 text-sm font-semibold ${scheduleMatchesValue ? "text-success" : "text-danger"}`}>Schedule total: LKR {scheduleTotal.toLocaleString("en-LK")} {scheduleMatchesValue ? "matches the villa value." : "will be saved only after it matches the villa value."}</p>}{scheduleEnabled && <p className="mt-2 text-sm text-muted-foreground">You can continue without completing these fields. The saved profile will show Payment schedule as incomplete.</p>}</div>}
      {step === 4 && <div className="mt-4"><h2 className="text-3xl font-medium">Review the villa profile</h2><p className="mt-2 text-base text-muted-foreground">Confirm the details below. Optional items can still be completed after saving.</p><div className="mt-8 space-y-4"><div className="flex items-center gap-4 rounded-2xl border bg-surface p-5"><span className="grid size-12 place-items-center rounded-xl bg-surface-muted"><Home className="size-6 text-primary" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Villa</p><p className="mt-1 font-semibold">Villa {number}</p><p className="mt-1 text-sm text-muted-foreground">{selectedProject.name} <span aria-hidden="true">·</span> {villaType} <span aria-hidden="true">·</span> LKR {Number(value).toLocaleString("en-LK")}</p></div></div><div className="flex items-center gap-4 rounded-2xl border bg-surface p-5"><span className="grid size-12 place-items-center rounded-xl bg-surface-muted"><CircleUserRound className="size-6 text-primary" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Customer</p><p className="mt-1 font-semibold">{customerMode === "unassigned" ? "Unassigned" : customerMode === "existing" ? selectedCustomer?.fullName : newCustomer.fullName}</p><p className="mt-1 text-sm text-muted-foreground">{customerMode === "unassigned" ? "Can be assigned later" : customerMode === "existing" ? selectedCustomer?.email : newCustomer.email}</p></div></div><div className="flex items-center gap-4 rounded-2xl border bg-surface p-5"><span className="grid size-12 place-items-center rounded-xl bg-surface-muted"><Clock3 className="size-6 text-primary" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finance</p><p className="mt-1 font-semibold">{interestEnabled ? "Interest terms enabled" : "Interest terms not applied"}</p><p className="mt-1 text-sm text-muted-foreground">{scheduleIsComplete ? `${schedule.length} payment schedule stage${schedule.length === 1 ? "" : "s"}` : scheduleEnabled ? "Payment schedule is incomplete and will be added later" : "Payment schedule can be added later"}</p></div></div></div><div className="mt-5 flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-4 text-success"><CheckCircle2 className="size-6" /><div><p className="font-semibold">Ready to save</p><p className="mt-1 text-sm">You will go directly to the Villa profile, where any missing setup stays clearly visible.</p></div></div></div>}
      {error && <p className="mt-7 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
    </section></main><footer className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 px-5 py-4 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-6xl justify-end gap-3"><Button onClick={() => router.push(`/projects/${projectId}/villas/${villaId}`)} type="button" variant="outline">Cancel</Button>{step > 1 && <Button onClick={() => setStep((current) => (current - 1) as Step)} type="button" variant="ghost">Back</Button>}<Button disabled={saving} onClick={step === 4 ? saveVilla : continueStep} type="button">{saving ? "Creating..." : step === 4 ? "Create Villa profile" : "Continue"}</Button></div></footer></div>;
}
