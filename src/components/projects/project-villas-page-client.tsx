"use client";

import { ChevronDown, Eye, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MockDatabase, VillaOperationalStatus } from "@/lib/domain/types";
import { villaStatusLabels } from "@/lib/domain/status-labels";
import { formatLkr } from "@/lib/formatters";
import { deriveVillaSummaries, type VillaSummary } from "@/lib/projects/villa-summary";


type VillaRow = { kind: "configured"; summary: VillaSummary } | { kind: "placeholder"; id: string; number: string };
type StatusFilter = "all" | VillaOperationalStatus;

const villaStatusStyles: Record<VillaOperationalStatus, string> = {
  available: "bg-success/10 text-success",
  reserved: "bg-warning/15 text-warning",
  scheduled: "bg-sky-100 text-sky-700",
  cancelled: "bg-danger/10 text-danger",
  sold: "bg-surface-muted text-foreground",
};

function VillaStatusBadge({ status }: { status: VillaOperationalStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${villaStatusStyles[status]}`}>{villaStatusLabels[status]}</span>;
}

function formattedVillaNumber(number: string) {
  return number.replace(/^[A-Z]+-/, "");
}

function VillaTable({ projectId, rows }: { projectId: string; rows: VillaRow[] }) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto rounded-xl border bg-surface">
      <table className="min-w-240 w-full border-collapse text-left">
        <thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-5 py-4">Villa</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Value (LKR)</th><th className="px-5 py-4">Collected (LKR)</th><th className="px-5 py-4">Outstanding (LKR)</th><th className="px-5 py-4 text-right">Status</th></tr></thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const villaId = row.kind === "configured" ? row.summary.villa.id : row.id;
            const number = row.kind === "configured" ? formattedVillaNumber(row.summary.villa.number) : row.number;
            const villa = row.kind === "configured" ? row.summary.villa : null;
            const customer = row.kind === "configured" ? row.summary.customer : null;
            const financials = row.kind === "configured" ? row.summary.financials : null;
            const href = `/projects/${projectId}/villas/${villaId}`;
            return <tr className="group cursor-pointer transition-colors hover:bg-surface-subtle" key={villaId} onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
              router.push(href);
            }}>
              <td className="px-5 py-4"><Link className="block rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={href}>Villa {number}{row.kind === "configured" && <span className="mt-1 block text-sm font-normal text-muted-foreground">{row.summary.villa.type}</span>}</Link></td>
              <td className="px-5 py-4 text-sm">{customer ? <><span className="font-medium">{customer.fullName}</span><span className="mt-1 block text-muted-foreground">{customer.phone}</span></> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-sm">{financials && villa ? <><span className="font-medium">{formatLkr(financials.totalValue || villa.value)}</span><span className="mt-1 block text-muted-foreground">Villa value</span></> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-sm">{financials ? <span className="font-medium">{formatLkr(financials.principalCollected)}</span> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-sm">{financials ? <span className="font-semibold">{formatLkr(financials.outstandingPrincipal)}</span> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-right">{row.kind === "configured" ? <VillaStatusBadge status={row.summary.villa.operationalStatus} /> : <span className="text-sm text-muted-foreground">-</span>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectVillasPageClient({ projectId, database }: { projectId: string; database: MockDatabase }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const project = database.projects.find((candidate) => candidate.id === projectId) ?? null;
  const rows = useMemo<VillaRow[]>(() => {
    if (!project) return [];
    const configured = deriveVillaSummaries(database, projectId).map((summary) => ({ kind: "configured" as const, summary }));
    const usedNumbers = new Set(configured.map((item) => formattedVillaNumber(item.summary.villa.number)));
    const placeholders = Array.from({ length: project.plannedVillaCount ?? 0 }, (_, index) => String(index + 1).padStart(2, "0"))
      .filter((number) => !usedNumbers.has(number))
      .map((number) => ({ kind: "placeholder" as const, id: `draft-${number}`, number }));
    return [...configured, ...placeholders];
  }, [database, project, projectId]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    if (row.kind === "placeholder") return search.trim() === "" && status === "all";
    const query = search.trim().toLocaleLowerCase();
    return (status === "all" || row.summary.villa.operationalStatus === status) && (!query || row.summary.villa.number.toLocaleLowerCase().includes(query) || row.summary.customer?.fullName.toLocaleLowerCase().includes(query));
  }), [rows, search, status]);
  const nextVillaNumber = useMemo(() => {
    const placeholder = rows.find((row) => row.kind === "placeholder");
    if (placeholder?.kind === "placeholder") return placeholder.number;
    const highestNumber = rows.reduce((highest, row) => {
      const number = row.kind === "configured" ? Number(formattedVillaNumber(row.summary.villa.number)) : Number(row.number);
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 0);
    return String(highestNumber + 1).padStart(2, "0");
  }, [rows]);

  return (
    <AppShell active="Projects & Villas">
      <div className="max-w-none">
        {!project ? <div className="grid min-h-96 place-items-center rounded-xl border bg-surface"><div className="text-center"><h1 className="text-xl font-semibold">Project not found</h1><Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href="/projects">Return to projects</Link></div></div> : <>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><Link className="text-sm font-semibold text-muted-foreground hover:text-foreground" href="/projects">Projects &amp; Villa</Link><h1 className="mt-3 font-display text-3xl font-semibold">Villas</h1><p className="mt-2 text-base text-muted-foreground">{project.name} <span aria-hidden="true">·</span> Track availability, owners and financial position.</p></div><Button asChild className="w-full border-accent bg-surface text-foreground shadow-none sm:w-auto" size="lg" variant="outline"><Link href={`/projects/${projectId}/villas/draft-${nextVillaNumber}/setup`}>Add Villa <Plus className="size-5" /></Link></Button></div>
          <div className="mt-9 flex flex-col gap-4 lg:flex-row"><label className="relative max-w-2xl flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-14 border-accent pl-12 text-base" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" type="search" value={search} /></label><label className="relative w-full lg:w-60"><span className="sr-only">Villa status</span><select className="h-14 w-full appearance-none rounded-xl border border-accent bg-surface px-5 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}><option value="all">Status</option>{Object.entries(villaStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /></label></div>
          {visibleRows.length === 0 ? <div className="mt-5 grid min-h-64 place-items-center rounded-xl border border-dashed bg-surface px-6 text-center"><div><Eye aria-hidden="true" className="mx-auto size-7 text-accent" /><h2 className="mt-4 font-semibold">No matching villas</h2><p className="mt-2 text-sm text-muted-foreground">Try another search or status.</p></div></div> : <div className="mt-5"><VillaTable projectId={projectId} rows={visibleRows} /></div>}
        </>}
      </div>
    </AppShell>
  );
}
