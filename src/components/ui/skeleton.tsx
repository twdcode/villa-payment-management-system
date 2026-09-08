import { cn } from "@/lib/utils";

/**
 * A placeholder block shown while a page's data is still being fetched.
 *
 * Next.js only shows its own small "rendering" indicator during a server render, which is
 * easy to miss and says nothing about what is coming. A skeleton in the shape of the real
 * content tells the user the page is working and roughly what will appear, so the layout
 * does not jump when the data lands.
 *
 * `aria-hidden`: this is decorative. The surrounding `loading.tsx` carries the accessible
 * status message, so a screen reader hears "Loading…" once instead of reading out dozens
 * of empty boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}

/** Table rows in the shape the real table uses, so nothing shifts when data arrives. */
export function SkeletonTable({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex gap-4 border-b bg-surface-subtle px-4 py-3">
        {Array.from({ length: columns }, (_, index) => <Skeleton className="h-3 flex-1" key={index} />)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            // Varying the widths stops the block reading as a grid of identical bars, which
            // looks more like a broken table than a loading one.
            <Skeleton className={cn("h-3 flex-1", column === 0 && "max-w-24", column === columns - 1 && "max-w-16")} key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The four-across summary cards several pages open with. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div className="rounded-lg border bg-surface p-5" key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Page title and subtitle, so the header does not pop in after the body. */
export function SkeletonPageHeader() {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      <Skeleton className="h-11 w-36" />
    </div>
  );
}

/** The filter row: a wide search box followed by narrower selects. */
export function SkeletonFilters({ selects = 3 }: { selects?: number }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(var(--skeleton-selects),minmax(0,.6fr))]" style={{ "--skeleton-selects": selects } as React.CSSProperties}>
      <Skeleton className="h-12" />
      {Array.from({ length: selects }, (_, index) => <Skeleton className="h-12" key={index} />)}
    </div>
  );
}
