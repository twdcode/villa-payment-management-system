import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";

export default function VillaProfileLoading() {
  return (
    <AppShell active="Projects & Villas">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading villa profile…</span>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-4 w-28" />
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-11 w-36" key={index} />)}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-5 rounded-lg bg-primary px-6 py-7">
          <div className="size-14 shrink-0 animate-pulse rounded-md bg-surface-muted/30" />
          <div className="min-w-0 flex-1">
            <div className="h-6 w-48 animate-pulse rounded-md bg-surface-muted/30" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-surface-muted/20" />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-9 w-28" key={index} />)}
        </div>
        <div className="mt-6"><SkeletonCards count={5} /></div>
        {/* Payment schedule beside the agreement terms panel. */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border bg-surface p-5 sm:p-7">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-64" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-10 w-full" key={index} />)}
            </div>
          </div>
          <div className="h-fit rounded-lg border bg-surface p-5 sm:p-6">
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
