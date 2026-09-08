import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

/** Customers is a card grid, not a table — the placeholder matches that. */
export default function CustomersLoading() {
  return (
    <AppShell active="Customers">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading customers…</span>
        <SkeletonPageHeader />
        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="flex min-h-30 items-center gap-4 rounded-lg border bg-surface p-5" key={index}>
              <Skeleton className="size-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
