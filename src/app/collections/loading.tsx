import { AppShell } from "@/components/layout/app-shell";
import { SkeletonCards, SkeletonFilters, SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Shown while `page.tsx` fetches on the server.
 *
 * `AppShell` renders immediately — it is a client component that loads the signed-in user
 * itself — so the sidebar and header are real while only the body is a placeholder. That
 * keeps navigation usable during the wait instead of blanking the whole screen.
 */
export default function CollectionsLoading() {
  return (
    <AppShell active="Collections">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading collections…</span>
        <SkeletonPageHeader />
        <div className="mt-7"><SkeletonCards /></div>
        <div className="mt-8 flex gap-3">
          <div className="h-9 w-16 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-9 w-40 animate-pulse rounded-md bg-surface-muted" />
        </div>
        <div className="mt-4"><SkeletonFilters selects={4} /></div>
        <div className="mt-4"><SkeletonTable columns={10} rows={10} /></div>
      </div>
    </AppShell>
  );
}
