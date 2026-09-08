"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileWarning,
  Home,
  Landmark,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildDashboardSnapshot, type DashboardPaymentStatus } from "@/lib/dashboard/snapshot";
import type { MockDatabase } from "@/lib/domain/types";
import { formatLkr, formatLkrCompact, numberToWordsLkr } from "@/lib/formatters";
import { isVillaActive } from "@/lib/domain/villa-status";
import { villaLabel } from "@/lib/domain/villa-label";


const paymentStatusLabels: Record<DashboardPaymentStatus, string> = {
  overdue: "Overdue",
  due: "Due now",
  due_soon: "Due soon",
  scheduled: "Scheduled",
  planned: "Planned",
};

const paymentStatusClasses: Record<DashboardPaymentStatus, string> = {
  overdue: "bg-danger/10 text-danger",
  due: "bg-warning/15 text-warning",
  due_soon: "bg-warning/15 text-warning",
  scheduled: "bg-sky-100 text-sky-700",
  planned: "bg-surface-muted text-muted-foreground",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

function ScopeSelect({ label, children, onChange, value }: { label: string; children: React.ReactNode; onChange: (value: string) => void; value: string }) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={label} className="h-11 min-w-40 px-4 text-sm font-semibold"><SelectValue /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "default", href }: { label: string; value: number; icon: typeof Building2; tone?: "default" | "success" | "warning" | "danger" | "info"; href: string }) {
  const toneClasses = {
    default: "bg-surface-muted text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/10 text-danger",
    info: "bg-sky-100 text-sky-700",
  };
  return (
    <Link
      className={`flex min-h-36 min-w-0 flex-col rounded-lg border bg-surface p-4 transition-shadow hover:ring-[2.8px] hover:ring-inset focus-visible:outline-none focus-visible:ring-[2.8px] focus-visible:ring-inset sm:p-5 ${tone === "danger" ? "border-danger/30 hover:ring-danger focus-visible:ring-danger" : "hover:ring-primary focus-visible:ring-primary"}`}
      href={href}
    >
      <span className={`grid size-10 place-items-center rounded-md ${toneClasses[tone]}`}><Icon className="size-5" /></span>
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 min-w-0 text-xl font-semibold ${tone === "danger" ? "text-danger" : ""}`} title={numberToWordsLkr(value)}>{formatLkrCompact(value)}</p>
      <p className="mt-1 min-w-0 break-words text-xs capitalize text-muted-foreground" title={numberToWordsLkr(value)}>{numberToWordsLkr(value)}</p>
    </Link>
  );
}

function InterestPanel({ interestCollected, interestOutstanding, reminderCases, finalNotices }: { interestCollected: number; interestOutstanding: number; reminderCases: number; finalNotices: number }) {
  const totalInterest = interestCollected + interestOutstanding;
  const recovery = totalInterest > 0 ? interestCollected / totalInterest * 100 : 0;
  return (
    <section className="overflow-hidden rounded-lg border bg-surface">
      <header className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6"><div><h2 className="text-lg font-semibold">Interest &amp; follow-up</h2><p className="mt-1 text-sm text-muted-foreground">Contractual interest and notice position for the selected view</p></div><Link className="inline-flex items-center gap-2 text-sm font-semibold hover:text-muted-foreground" href="/collections">Open payment centre<ArrowRight className="size-4" /></Link></header>
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="bg-primary p-6 text-primary-foreground sm:p-7"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-full bg-white/10"><Clock3 className="size-6" /></span><div><p className="text-sm text-sidebar-muted">Accrued interest</p><p className="mt-1 text-2xl font-semibold">{formatLkr(interestOutstanding)}</p><p className="mt-1 text-xs text-sidebar-muted">Unpaid contractual interest</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-success" style={{ width: `${Math.min(100, recovery)}%` }} /></div><p className="mt-2 text-xs text-sidebar-muted">{recovery.toFixed(1)}% recovered</p></div>
        <div className="grid border-t lg:border-l lg:border-t-0"><div className="flex items-center gap-4 border-b p-5"><span className="grid size-10 place-items-center rounded-md bg-success/10 text-success"><CheckCircle2 className="size-5" /></span><div><p className="text-xs text-muted-foreground">Interest collected</p><p className="mt-1 font-semibold">{formatLkr(interestCollected)}</p><p className="mt-1 text-xs text-muted-foreground">Recorded on receipts</p></div></div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Follow-up path</p><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><p className="text-xs text-muted-foreground">Reminder cases</p><p className="mt-1 text-xl font-semibold">{reminderCases}</p></div><ArrowRight className="size-4 text-accent" /><div><p className="text-xs text-muted-foreground">Final notices</p><p className="mt-1 text-xl font-semibold">{finalNotices}</p></div></div></div></div>
      </div>
    </section>
  );
}

function AttentionPanel({ total, overdueCount, upcomingCount, reminderCount, finalCount }: { total: number; overdueCount: number; upcomingCount: number; reminderCount: number; finalCount: number }) {
  const items = [
    { label: "Overdue payments", count: overdueCount, icon: AlertTriangle, className: "text-danger" },
    { label: "Upcoming payments", count: upcomingCount, icon: CalendarDays, className: "text-warning" },
    { label: "Reminder cases", count: reminderCount, icon: BellRing, className: "text-sky-700" },
    { label: "Final notices", count: finalCount, icon: FileWarning, className: "text-primary" },
  ];
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6"><h2 className="text-lg font-semibold">Attention required</h2><p className="mt-1 text-xs text-muted-foreground">Due principal, overdue principal and interest</p><p className="mt-2 text-2xl font-medium text-danger">{formatLkrCompact(total)}</p><div className="mt-5 space-y-2">{items.map(({ label, count, icon: Icon, className }) => <Link className="flex min-h-11 items-center gap-3 rounded-md bg-surface-subtle px-3 text-sm hover:bg-surface-muted" href="/collections" key={label}><Icon className={`size-5 ${className}`} /><span className="font-semibold">{count}</span><span className="text-muted-foreground">{label}</span><ArrowRight className="ml-auto size-4 text-muted-foreground" /></Link>)}</div></section>
  );
}

function CollectionOverview({ total, collected, future, due, overdue }: { total: number; collected: number; future: number; due: number; overdue: number }) {
  const percent = (value: number) => total > 0 ? value / total * 100 : 0;
  const collectedRate = percent(collected);
  const segments = [
    { label: "Collected", value: collected, className: "bg-success", dot: "bg-success" },
    { label: "Not yet due", value: future, className: "bg-primary", dot: "bg-primary" },
    { label: "Due", value: due, className: "bg-warning", dot: "bg-warning" },
    { label: "Overdue", value: overdue, className: "bg-danger", dot: "bg-danger" },
  ];
  const circumference = 2 * Math.PI * 44;
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6"><h2 className="text-lg font-semibold">Collection overview</h2><div className="mt-5 grid gap-7 md:grid-cols-[9rem_1fr] md:items-center"><div className="relative mx-auto size-36"><svg aria-label={`${collectedRate.toFixed(1)} percent collection rate`} className="size-36 -rotate-90" role="img" viewBox="0 0 100 100"><circle className="stroke-surface-muted" cx="50" cy="50" fill="none" r="44" strokeWidth="8" /><circle className="stroke-success" cx="50" cy="50" fill="none" r="44" strokeDasharray={`${circumference * collectedRate / 100} ${circumference}`} strokeLinecap="round" strokeWidth="8" /></svg><div className="absolute inset-0 grid place-content-center text-center"><p className="text-xs text-muted-foreground">Collection rate</p><p className="mt-1 text-xl font-semibold text-success">{collectedRate.toFixed(1)}%</p></div></div><div><div className="flex h-4 overflow-hidden rounded-full bg-surface-muted">{segments.map((segment) => <span className={segment.className} key={segment.label} style={{ width: `${percent(segment.value)}%` }} />)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{segments.map((segment) => <div key={segment.label}><p className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${segment.dot}`} />{segment.label}</p><p className="mt-1 text-sm font-semibold">{formatLkrCompact(segment.value)}</p></div>)}</div></div></div></section>
  );
}

function UpcomingPayments({ payments }: { payments: ReturnType<typeof buildDashboardSnapshot>["payments"] }) {
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6"><header className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Upcoming payments</h2><Link className="inline-flex items-center gap-2 text-sm font-semibold hover:text-muted-foreground" href="/collections">View all<ArrowRight className="size-4" /></Link></header><div className="mt-5 overflow-x-auto"><table className="min-w-[42rem] w-full text-left text-sm"><thead className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="pb-3">Villa</th><th className="pb-3">Customer</th><th className="pb-3">Due date</th><th className="pb-3">Amount</th><th className="pb-3 text-right">Status</th></tr></thead><tbody>{payments.length ? payments.slice(0, 6).map((payment) => <tr className="border-t" key={payment.schedule.id}><td className="py-3 pr-4"><Link className="font-semibold hover:text-muted-foreground" href={`/projects/${payment.villa.projectId}/villas/${payment.villa.id}`}>{villaLabel(payment.villa.number)}</Link><p className="mt-1 text-xs text-muted-foreground">{payment.projectName}</p></td><td className="py-3 pr-4 font-medium">{payment.customerName}</td><td className="py-3 pr-4"><p className="font-semibold">{formatDate(payment.schedule.dueDate)}</p><p className={`mt-1 text-xs ${payment.daysUntilDue < 0 ? "text-danger" : "text-muted-foreground"}`}>{payment.daysUntilDue < 0 ? `${Math.abs(payment.daysUntilDue)} days overdue` : payment.daysUntilDue === 0 ? "Due today" : `Due in ${payment.daysUntilDue} days`}</p></td><td className="py-3 pr-4 font-semibold">{formatLkr(payment.amount)}</td><td className="py-3 text-right"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${paymentStatusClasses[payment.status]}`}>{paymentStatusLabels[payment.status]}</span></td></tr>) : <tr><td className="border-t py-9 text-center text-muted-foreground" colSpan={5}>No unpaid payment stages in this view.</td></tr>}</tbody></table></div></section>
  );
}

function LargestOutstanding({ villas }: { villas: ReturnType<typeof buildDashboardSnapshot>["largestOutstanding"] }) {
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Largest outstanding</h2><p className="mt-1 text-xs text-muted-foreground">Villas requiring attention</p></div><Link className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold hover:text-muted-foreground" href="/collections">View report<ArrowRight className="size-4" /></Link></header><div className="mt-5 space-y-3">{villas.length ? villas.slice(0, 5).map((item) => <Link className="flex items-center gap-3 rounded-md p-1 hover:bg-surface-subtle" href={`/projects/${item.villa.projectId}/villas/${item.villa.id}`} key={item.villa.id}><span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted"><Home className="size-5" /></span><div className="min-w-0"><p className="font-semibold">{villaLabel(item.villa.number)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.customerName} · {item.projectName}</p></div><div className="ml-auto text-right"><p className="whitespace-nowrap text-sm font-semibold">{formatLkr(item.outstanding)}</p>{item.overdue > 0 && <p className="mt-1 whitespace-nowrap text-xs text-danger">{formatLkr(item.overdue)} overdue</p>}</div></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">No outstanding villa balances.</p>}</div></section>
  );
}

function CustomerNotes({ notes }: { notes: ReturnType<typeof buildDashboardSnapshot>["customerNotes"] }) {
  return (
    <section className="rounded-lg border bg-surface p-5 sm:p-6"><header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Customer notes</h2><p className="mt-1 text-sm text-muted-foreground">Latest notes added to customer profiles</p></div><Link className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold hover:text-muted-foreground" href="/customers">All customers<ArrowRight className="size-4" /></Link></header><div className="mt-5">{notes.length ? notes.slice(0, 4).map((note) => <Link className="flex gap-3 border-t py-4 first:border-t-0 first:pt-0" href={`/customers/${note.customerId}`} key={note.id}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold">{initials(note.customerName)}</span><div className="min-w-0"><p className="font-semibold">{note.customerName}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{note.content}</p><p className="mt-1 text-xs text-accent">{formatDateTime(note.createdAt)} · {note.authorName}</p></div><ArrowRight className="ml-auto mt-2 size-4 shrink-0 text-muted-foreground" /></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">No customer notes in this view.</p>}</div></section>
  );
}

/**
 * `initialData`: fetched server-side by `app/dashboard/page.tsx` and passed down, so the
 * dashboard's first paint needs no client-side round trip. In mock mode (no Supabase
 * project yet) `page.tsx` cannot call the repository server-side, so this stays optional
 * and the `useEffect` below covers that case exactly as before.
 */
export function DashboardPageClient({ database }: { database: MockDatabase }) {
  const [projectId, setProjectId] = useState("all");
  const [villaId, setVillaId] = useState("all");

  const availableVillas = useMemo(() => database.villas.filter((villa) => isVillaActive(villa) && (projectId === "all" || villa.projectId === projectId)), [database, projectId]);
  const snapshot = useMemo(() => buildDashboardSnapshot(database, { projectId, villaId }), [database, projectId, villaId]);
  const metrics = [
    { label: "Total project value", value: snapshot.totalProjectValue, icon: Building2, tone: "default" as const, href: "/projects" },
    { label: "Total collected", value: snapshot.totalCollected, icon: CheckCircle2, tone: "success" as const, href: "/collections" },
    { label: "Outstanding", value: snapshot.outstanding, icon: WalletCards, tone: "info" as const, href: "/collections" },
    { label: "Currently due", value: snapshot.currentlyDue, icon: Clock3, tone: "warning" as const, href: "/collections" },
    { label: "Overdue", value: snapshot.overdue, icon: AlertTriangle, tone: "danger" as const, href: "/collections" },
  ];

  return (
    <AppShell active="Dashboard">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold">Dashboard</h1><p className="mt-2 text-muted-foreground">Your live portfolio and collection priorities as at {formatDate(database.today)}.</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><ScopeSelect label="Filter dashboard by project" onChange={(value) => { setProjectId(value); setVillaId("all"); }} value={projectId}><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</ScopeSelect><ScopeSelect label="Filter dashboard by villa" onChange={setVillaId} value={villaId}><SelectItem value="all">All villas</SelectItem>{availableVillas.map((villa) => <SelectItem key={villa.id} value={villa.id}>{villaLabel(villa.number)}</SelectItem>)}</ScopeSelect></div></div>
      <section aria-label="Portfolio summary" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</section>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(18rem,.95fr)]"><div className="min-w-0 space-y-6"><InterestPanel finalNotices={snapshot.finalNoticeCount} interestCollected={snapshot.interestCollected} interestOutstanding={snapshot.interestOutstanding} reminderCases={snapshot.reminderCaseCount} /><CollectionOverview collected={snapshot.totalCollected} due={snapshot.currentlyDue} future={snapshot.futureOutstanding} overdue={snapshot.overdue} total={snapshot.totalProjectValue} /><UpcomingPayments payments={snapshot.payments} /><CustomerNotes notes={snapshot.customerNotes} /></div><aside className="min-w-0 space-y-6"><AttentionPanel finalCount={snapshot.finalNoticeCount} overdueCount={snapshot.overduePaymentCount} reminderCount={snapshot.reminderCaseCount} total={snapshot.attentionTotal} upcomingCount={snapshot.upcomingPaymentCount} /><LargestOutstanding villas={snapshot.largestOutstanding} />{snapshot.scopedVillaCount === 0 && <div className="rounded-lg border bg-surface p-6 text-center"><Landmark className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 font-semibold">No active villas in this view</p><p className="mt-1 text-sm text-muted-foreground">Choose another project or villa to review its portfolio data.</p></div>}<div className="rounded-lg border bg-surface p-5"><div className="flex items-center gap-3"><CircleDollarSign className="size-5 text-success" /><p className="font-semibold">Data reconciled</p></div><p className="mt-2 text-sm text-muted-foreground">Values are calculated from active villa schedules and recorded stage payments.</p></div></aside></div>
    </AppShell>
  );
}
