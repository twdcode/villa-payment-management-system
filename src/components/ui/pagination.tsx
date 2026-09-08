"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * Slices a list into pages and keeps the page number honest.
 *
 * Pagination is CLIENT-side: every list on these screens is already fully in memory from
 * `getDatabase()`, so the win here is not fetching less but rendering less — a few hundred
 * rows of DOM per table is what makes the page feel slow, and the browser only ever builds
 * ten. Moving the slice to the server means reshaping the whole repository layer and is
 * worth doing when a project's data outgrows a single payload, not before.
 *
 * `items` must be the FILTERED list: filtering then paginating is the only order that
 * gives "page 1 of the results", and it is why the page resets whenever the filters
 * change the list length.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // A filter that shrinks the list can strand the viewer on a page that no longer exists —
  // page 4 of a list that now has two pages would render empty, which reads as "no
  // results" rather than "wrong page". Clamped during render rather than corrected in an
  // effect: an effect would paint the empty page first and then re-render, and writing
  // state from an effect on every filter change is the pattern `react-hooks` warns about.
  const safePage = Math.min(page, pageCount);
  const visible = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, pageSize, safePage],
  );

  return { page: safePage, pageCount, setPage, visible };
}

/**
 * Page numbers with ellipses, always showing first, last and the current neighbourhood.
 *
 * Rendering one button per page is fine at five pages and unusable at fifty, so the list
 * is windowed. Returns literal numbers and `"gap"` markers rather than pre-rendered nodes
 * so the caller keeps control of the markup.
 */
function pageItems(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const items: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("gap");
  for (let index = start; index <= end; index += 1) items.push(index);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}

export function Pagination({
  label,
  onPageChange,
  onPageSizeChange,
  page,
  pageCount,
  pageSize,
  total,
}: {
  /** Plural noun for the row count, e.g. "payments". */
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  // Nothing to page through and nothing to choose — a lone "1" button and a size selector
  // over an empty table is noise.
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label={`${label} pagination`} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">Showing <span className="font-semibold text-foreground">{first}&ndash;{last}</span> of <span className="font-semibold text-foreground">{total}</span> {label}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Rows
          <Select onValueChange={(next) => onPageSizeChange(Number(next))} value={String(pageSize)}>
            <SelectTrigger className="h-9 w-20 px-3 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {pageCount > 1 && <div className="flex items-center gap-1">
          <Button aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)} size="icon" variant="outline"><ChevronLeft className="size-4" /></Button>
          {pageItems(page, pageCount).map((item, index) => item === "gap"
            ? <span aria-hidden="true" className="px-1 text-sm text-muted-foreground" key={`gap-${index}`}>&hellip;</span>
            : <Button aria-current={item === page ? "page" : undefined} aria-label={`Page ${item}`} key={item} onClick={() => onPageChange(item)} size="icon" variant={item === page ? "default" : "outline"}>{item}</Button>)}
          <Button aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} size="icon" variant="outline"><ChevronRight className="size-4" /></Button>
        </div>}
      </div>
    </nav>
  );
}
