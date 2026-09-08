import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Settings is a sidebar of sections beside the active panel — matched at `lg`, as the page is. */
export default function SettingsLoading() {
  return (
    <AppShell active="Settings">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading settings…</span>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-64" />
        <div className="mt-8 grid min-w-0 max-w-full gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="rounded-lg border bg-surface p-5">
            <Skeleton className="h-4 w-32" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {Array.from({ length: 6 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}
            </div>
          </div>
          <div className="rounded-lg border bg-surface p-5 sm:p-7">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="mt-2 h-3 w-72" />
            <div className="mt-6 space-y-5">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-2 h-12 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
