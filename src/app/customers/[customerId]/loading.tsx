import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";

export default function CustomerProfileLoading() {
  return (
    <AppShell active="Customers">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading customer profile…</span>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-36" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
        {/* The dark identity banner — a solid block rather than a pulse, since it is the
            one area that is dark in the real page and a light shimmer would read wrong. */}
        <div className="mt-6 flex items-center gap-5 rounded-lg bg-primary px-6 py-7">
          <div className="size-20 shrink-0 animate-pulse rounded-full bg-surface-muted/30" />
          <div className="min-w-0 flex-1">
            <div className="h-6 w-56 animate-pulse rounded-md bg-surface-muted/30" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-surface-muted/20" />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="mt-6"><SkeletonCards /></div>
        <div className="mt-6 rounded-lg border bg-surface p-5 sm:p-7">
          <Skeleton className="h-5 w-56" />
          <div className="mt-8 flex gap-6">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="flex flex-1 flex-col items-center gap-3" key={index}>
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
