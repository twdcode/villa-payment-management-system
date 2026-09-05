"use client";

import { Eye, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MockDatabase, VillaOperationalStatus } from "@/lib/domain/types";
import { villaStatusLabels } from "@/lib/domain/status-labels";
import { matchesVillaSearch } from "@/lib/domain/villa-search";
import { formatLkr } from "@/lib/formatters";
import { deriveVillaSummaries, type VillaSummary } from "@/lib/projects/villa-summary";

type StatusFilter = "all" | VillaOperationalStatus;

/** Same palette as the project-scoped villa table (C6: no new visual language). */
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

function VillaTable({ database, rows }: { database: MockDatabase; rows: VillaSummary[] }) {
  const router = useRouter();
  const projectsById = useMemo(() => new Map(database.projects.map((project) => [project.id, project])), [database.projects]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-surface">
      <table className="min-w-240 w-full border-collapse text-left">
        <thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-5 py-4">Villa</th><th className="px-5 py-4">Project</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Value (LKR)</th><th className="px-5 py-4">Collected (LKR)</th><th className="px-5 py-4">Outstanding (LKR)</th><th className="px-5 py-4 text-right">Status</th></tr></thead>
        <tbody className="divide-y">
          {rows.map((summary) => {
            const { customer, financials, villa } = summary;
            const project = projectsById.get(villa.projectId);
            const href = `/projects/${villa.projectId}/villas/${villa.id}`;
            return <tr className="group cursor-pointer transition-colors hover:bg-surface-subtle" key={villa.id} onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
              router.push(href);
            }}>
              <td className="px-5 py-4"><Link className="block rounded-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={href}>Villa {formattedVillaNumber(villa.number)}<span className="mt-1 block text-sm font-normal text-muted-foreground">{villa.type}</span></Link></td>
              <td className="px-5 py-4 text-sm">{project ? <span className="font-medium">{project.name}</span> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-sm">{customer ? <><span className="font-medium">{customer.fullName}</span><span className="mt-1 block text-muted-foreground">{customer.phone}</span></> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-5 py-4 text-sm"><span className="font-medium">{formatLkr(financials.totalValue || villa.value)}</span><span className="mt-1 block text-muted-foreground">Villa value</span></td>
              <td className="px-5 py-4 text-sm"><span className="font-medium">{formatLkr(financials.principalCollected)}</span></td>
              <td className="px-5 py-4 text-sm"><span className="font-semibold">{formatLkr(financials.outstandingPrincipal)}</span></td>
              <td className="px-5 py-4 text-right"><VillaStatusBadge status={villa.operationalStatus} /></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VillasPageClient({ database }: { database: MockDatabase }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [projectId, setProjectId] = useState<string>("all");

  const rows = useMemo(() => deriveVillaSummaries(database), [database]);
  const visibleRows = useMemo(() => rows.filter((summary) =>
    (status === "all" || summary.villa.operationalStatus === status) &&
    (projectId === "all" || summary.villa.projectId === projectId) &&
    matchesVillaSearch(search, summary.villa.number, summary.customer?.fullName),
  ), [rows, search, status, projectId]);

  return (
    <AppShell active="Villas">
      <div className="max-w-none">
        <>
          <div><h1 className="font-display text-3xl font-semibold">Villas</h1><p className="mt-2 text-base text-muted-foreground">Every villa across every project, in one place.</p></div>
          <div className="mt-9 flex flex-col gap-4 lg:flex-row">
            <label className="relative max-w-2xl flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-14 border-accent pl-12 text-base" onChange={(event) => setSearch(event.target.value)} placeholder="Search villa name or customer name" type="search" value={search} /></label>
            <Select onValueChange={setProjectId} value={projectId}><SelectTrigger aria-label="Project" className="h-14 w-full rounded-xl border-accent px-5 text-base font-semibold lg:w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{database.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
            <Select onValueChange={(next) => setStatus(next as StatusFilter)} value={status}><SelectTrigger aria-label="Villa status" className="h-14 w-full rounded-xl border-accent px-5 text-base font-semibold lg:w-60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Status</SelectItem>{Object.entries(villaStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>
          {visibleRows.length === 0 ? <div className="mt-5 grid min-h-64 place-items-center rounded-xl border border-dashed bg-surface px-6 text-center"><div><Eye aria-hidden="true" className="mx-auto size-7 text-accent" /><h2 className="mt-4 font-semibold">No matching villas</h2><p className="mt-2 text-sm text-muted-foreground">Try another search, project or status.</p></div></div> : <div className="mt-5"><VillaTable database={database} rows={visibleRows} /></div>}
        </>
      </div>
    </AppShell>
  );
}
