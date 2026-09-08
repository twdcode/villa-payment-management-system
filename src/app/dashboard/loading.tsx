import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <AppShell active="Dashboard">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading dashboard…</span>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Skeleton className="h-8 w-44" />
            <Skeleton className="mt-3 h-4 w-80" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-12 w-full sm:w-44" />
            <Skeleton className="h-12 w-full sm:w-44" />
          </div>
        </div>
        <div className="mt-7"><SkeletonCards count={5} /></div>
        {/* The two-column body: interest and follow-up beside the attention list. */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="rounded-lg border bg-surface p-5 sm:p-6" key={index}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-3 w-64" />
              <div className="mt-6 space-y-4">
                {Array.from({ length: 4 }, (_, row) => <Skeleton className="h-4 w-full" key={row} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
