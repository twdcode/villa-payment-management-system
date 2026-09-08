"use client";

import { Building2, CornerDownLeft, Home, Loader2, Search, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { globalSearchAction, type SearchResult } from "@/lib/actions/search";
import { cn } from "@/lib/utils";

const groupOrder = ["project", "villa", "customer"] as const;

const groupLabels: Record<SearchResult["kind"], string> = {
  project: "Projects",
  villa: "Villas",
  customer: "Customers",
};

const groupIcons: Record<SearchResult["kind"], typeof Building2> = {
  project: Building2,
  villa: Home,
  customer: UserRound,
};

/** Long enough that typing a word does not fire a query per keystroke. */
const DEBOUNCE_MS = 200;

/**
 * Whether to label the shortcut "⌘K" or "Ctrl K".
 *
 * Read through `useSyncExternalStore` rather than an effect: the server has no `navigator`,
 * so it returns `null` there and the hint simply is not rendered until the client knows the
 * answer — no hydration mismatch, and no "⌘" briefly shown to a Windows user.
 *
 * Order matters. `userAgentData.platform` is the current API but Chromium-only; the user
 * agent string is the reliable cross-browser signal; `navigator.platform` is deprecated and
 * comes last, because it can disagree with the real platform (a spoofed or emulated browser
 * reports the host machine's value, which would label a Windows user's shortcut "⌘K").
 */
const subscribeToNothing = () => () => {};
const readAppleKeyboard = () => {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  if (platform) return /mac/i.test(platform);
  if (navigator.userAgent) return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
  return /mac|iphone|ipad|ipod/i.test(navigator.platform ?? "");
};
const readAppleKeyboardOnServer = (): boolean | null => null;

/**
 * Workspace-wide search: a real input in the header, with results dropping down beneath it.
 *
 * Deliberately not a centred modal. The search box is where the user clicked, so that is
 * where the caret and the results belong — moving focus to the middle of the screen makes
 * the user re-find the thing they were already pointing at.
 *
 * Results come from `globalSearchAction` rather than a client-side filter, so a role only
 * ever receives rows it is allowed to see. The query is debounced, and results are stored
 * tagged with the query that produced them, so a slow response for "ni" can never be
 * rendered under "nimal".
 *
 * Built as an ARIA combobox rather than a listbox inside a dialog: focus stays in the input
 * throughout and `aria-activedescendant` tells a screen reader which row is highlighted,
 * which is the pattern assistive technology expects from a search field.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [answered, setAnswered] = useState<{ query: string; results: SearchResult[] }>({ query: "", results: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const isAppleKeyboard = useSyncExternalStore(subscribeToNothing, readAppleKeyboard, readAppleKeyboardOnServer);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Identifies the newest query so a late response for an older one can be discarded.
  const latestQuery = useRef("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ctrl+K on Windows and Linux, ⌘K on macOS. Both are bound; only the hint differs.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    latestQuery.current = trimmed;
    // Too short to search: nothing is fetched, and the render below ignores whatever the
    // previous query left behind, so there is no stale list to clear here.
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      void globalSearchAction(trimmed)
        .then((results) => {
          // Discard a response that arrived after the user typed something else.
          if (latestQuery.current !== trimmed) return;
          setAnswered({ query: trimmed, results });
          setActiveIndex(0);
        })
        .catch(() => {
          if (latestQuery.current === trimmed) setAnswered({ query: trimmed, results: [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Close when a click or focus lands outside the search area.
  useEffect(() => {
    if (!open) return;
    function closeIfOutside(event: Event) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
    };
  }, [open]);

  const trimmedQuery = query.trim();
  const isSearchable = trimmedQuery.length >= 2;
  // Both derived from one source of truth: the list is current only when it was fetched for
  // exactly the text now in the box, and anything else means a request is still in flight.
  const isCurrent = isSearchable && answered.query === trimmedQuery;
  const isLoading = isSearchable && !isCurrent;

  // Results are rendered grouped but navigated as one flat list, so the arrow keys move
  // straight from the last project to the first villa.
  const grouped = useMemo(() => {
    const visibleResults = isCurrent ? answered.results : [];
    const flat: SearchResult[] = [];
    const sections: Array<{ kind: SearchResult["kind"]; items: Array<{ result: SearchResult; index: number }> }> = [];
    for (const kind of groupOrder) {
      const items = visibleResults.filter((result) => result.kind === kind);
      if (items.length === 0) continue;
      sections.push({ kind, items: items.map((result) => ({ result, index: flat.push(result) - 1 })) });
    }
    return { sections, flat };
  }, [answered.results, isCurrent]);

  const clear = useCallback(() => {
    setQuery("");
    setAnswered({ query: "", results: [] });
    setActiveIndex(0);
    inputRef.current?.focus();
  }, []);

  const go = useCallback((result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setAnswered({ query: "", results: [] });
    setActiveIndex(0);
    inputRef.current?.blur();
    router.push(result.href);
  }, [router]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // First Escape clears the typed query, a second closes the panel — so Escape never
      // throws away what was typed and dismisses the panel in the same stroke.
      if (query) clear();
      else setOpen(false);
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (grouped.flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % grouped.flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + grouped.flat.length) % grouped.flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = grouped.flat[activeIndex];
      if (selected) go(selected);
    }
  }

  // Keep the highlighted row inside the scroll box when arrowing past its edge.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const showEmpty = !isLoading && isSearchable && grouped.flat.length === 0;
  const activeResult = grouped.flat[activeIndex];

  return (
    <div className="relative w-full max-w-xl lg:w-96 lg:flex-initial" ref={containerRef}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-activedescendant={activeResult ? `global-search-option-${activeResult.id}` : undefined}
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-expanded={open}
          aria-label="Search customers, villas and projects"
          autoComplete="off"
          className={cn(
            "h-11 w-full rounded-md border bg-surface pl-11 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            // Room on the right for the clear button, or for the shortcut hint when empty.
            query ? "pr-11" : "pr-20",
          )}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search customer, villa, project..."
          ref={inputRef}
          role="combobox"
          type="text"
          value={query}
        />
        {isLoading && <Loader2 aria-hidden="true" className={cn("pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground", query ? "right-11" : "right-20")} />}
        {query ? (
          <button
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            onClick={clear}
            type="button"
          >
            <X className="size-4" />
          </button>
        ) : (
          // Rendered only once the platform is known, and never on touch, where there is no
          // physical keyboard to press it on.
          isAppleKeyboard !== null && (
            /* `pointer-fine`, not a width breakpoint: a large tablet is wider than `sm` but
               still has no physical keyboard to press the shortcut on. */
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-surface-muted px-1.5 py-0.5 font-sans text-[0.7rem] font-semibold text-muted-foreground pointer-fine:block">
              {isAppleKeyboard ? "⌘K" : "Ctrl K"}
            </kbd>
          )
        )}
      </div>

      {open && (
        <div
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-md border bg-surface shadow-xl"
          id="global-search-results"
          role="listbox"
        >
          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain py-1" ref={listRef}>
            {grouped.sections.map((section) => {
              const Icon = groupIcons[section.kind];
              return (
                <div className="py-1" key={section.kind}>
                  <p className="px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{groupLabels[section.kind]}</p>
                  {section.items.map(({ result, index }) => (
                    <button
                      aria-selected={index === activeIndex}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        index === activeIndex ? "bg-surface-muted" : "hover:bg-surface-subtle",
                      )}
                      data-active={index === activeIndex}
                      id={`global-search-option-${result.id}`}
                      key={result.id}
                      // `mousedown` rather than `click`: the input's blur would otherwise
                      // close the panel before a click could land.
                      onMouseDown={(event) => { event.preventDefault(); go(result); }}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                      type="button"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-primary"><Icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{result.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                      </span>
                      {index === activeIndex && <CornerDownLeft aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" />}
                    </button>
                  ))}
                </div>
              );
            })}

            {showEmpty && (
              <div className="px-4 py-8 text-center">
                <Search aria-hidden="true" className="mx-auto size-6 text-accent" />
                <p className="mt-2.5 text-sm font-semibold">No matches for &ldquo;{trimmedQuery}&rdquo;</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a villa name, customer name, or project.</p>
              </div>
            )}

            {!isSearchable && (
              <div className="px-4 py-8 text-center">
                <Search aria-hidden="true" className="mx-auto size-6 text-accent" />
                <p className="mt-2.5 text-sm font-semibold">Search the whole workspace</p>
                <p className="mt-1 text-xs text-muted-foreground">Projects, villas and customers. Type at least two characters.</p>
              </div>
            )}
          </div>

          {grouped.flat.length > 0 && (
            // Keyboard legend only where there is a keyboard to use it with.
            <footer className="hidden items-center gap-4 border-t bg-surface-subtle px-4 py-2 text-[0.7rem] text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5"><kbd className="rounded border bg-surface px-1.5 py-0.5 font-sans font-semibold">↑↓</kbd>navigate</span>
              <span className="flex items-center gap-1.5"><kbd className="rounded border bg-surface px-1.5 py-0.5 font-sans font-semibold">↵</kbd>open</span>
              <span className="flex items-center gap-1.5"><kbd className="rounded border bg-surface px-1.5 py-0.5 font-sans font-semibold">esc</kbd>close</span>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
