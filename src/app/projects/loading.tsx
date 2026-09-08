import { AppShell } from "@/components/layout/app-shell";
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <AppShell active="Projects & Villas">
      <div aria-busy="true" aria-live="polite" role="status">
        <span className="sr-only">Loading projects…</span>
        <SkeletonPageHeader />
        <div className="mt-8 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="rounded-lg border bg-surface p-5 sm:p-6" key={index}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="mt-5 space-y-3">
                {Array.from({ length: 3 }, (_, row) => <Skeleton className="h-4 w-full" key={row} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
