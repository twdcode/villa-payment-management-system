import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonFilters, SkeletonTable } from "@/components/ui/skeleton";

export default function ProjectVillasLoading() {
  return (
    <AppShell active="Projects & Villas">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading project…</span>
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-3 h-4 w-48" />
          </div>
          <Skeleton className="h-11 w-32" />
        </div>
        <div className="mt-8"><SkeletonFilters selects={2} /></div>
        <div className="mt-5"><SkeletonTable columns={6} rows={8} /></div>
      </div>
    </AppShell>
  );
}
