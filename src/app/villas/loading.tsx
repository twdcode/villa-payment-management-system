import { AppShell } from "@/components/layout/app-shell";
import { SkeletonFilters, SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

export default function VillasLoading() {
  return (
    <AppShell active="Villas">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading villas…</span>
        <SkeletonPageHeader />
        <div className="mt-8"><SkeletonFilters selects={2} /></div>
        <div className="mt-5"><SkeletonTable columns={7} rows={10} /></div>
      </div>
    </AppShell>
  );
}
