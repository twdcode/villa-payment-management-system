"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronRight, CreditCard, Home, LayoutDashboard, LogOut, Menu, Settings, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationCentre } from "@/components/layout/notification-centre";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import type { User } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { can, roleLabels, type Permission } from "@/lib/permissions/roles";
import { getCurrentUserAction, signOutAction } from "@/lib/auth/actions";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { IdleTimeoutGuard } from "@/components/auth/idle-timeout-guard";


const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects & Villas", icon: Building2 },
  { href: "/villas", label: "Villas", icon: Home },
  { href: "/customers", label: "Customers", icon: UsersRound },
  { href: "/collections", label: "Collections", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings, permission: "view_settings" as Permission },
];

/** Initials for the avatar. */
function initials(name: string | undefined): string {
  if (!name) return "JV";
  return name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

type AppShellProps = { children: React.ReactNode; active?: string };

/**
 * One navigation for every screen size.
 *
 * The sidebar is a permanent rail from `lg` up and a slide-in drawer below it, opened by
 * the button in the top-left of the header. The app previously had a second, separate
 * bottom tab bar on small screens: it could only fit five destinations, so a Super Admin's
 * sixth was pushed into a cramped "More" menu, and because the account block lives in the
 * sidebar there was no way to sign out on a phone at all. A single nav carries every
 * destination, the signed-in user and Logout at every width, with nothing to overflow.
 */
export function AppShell({ children, active = "Dashboard" }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void getCurrentUserAction().then(setCurrentUser);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutAction();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    /**
     * Bound to `click`, not `pointerdown`.
     *
     * On `pointerdown` this ran while the button was still being pressed. The event target
     * inside a menu item is its ICON, and closing the menu unmounted that icon before the
     * browser could dispatch the matching `click` — so the item's own handler never fired
     * and Logout silently did nothing. Keyboard activation was unaffected, which is what
     * made it look intermittent.
     */
    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  /**
   * Navigating closes the drawer and the account menu — the links are client-side, so the
   * shell never remounts and an open drawer would sit over the page just navigated to.
   *
   * Derived during render rather than in an effect: setting state from an effect renders
   * the new page once with the drawer still open, then again to close it, which shows as a
   * flash of the overlay on every navigation.
   */
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (renderedPath !== pathname) {
    setRenderedPath(pathname);
    setSidebarOpen(false);
    setAccountMenuOpen(false);
  }

  useEffect(() => {
    if (!sidebarOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    // The drawer covers the page; letting the page scroll underneath it is disorienting.
    document.body.style.overflow = "hidden";
    // Focus moves into the drawer so a keyboard or screen-reader user is not left behind
    // on the trigger, reading the page hidden behind the overlay.
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const permittedNavigation = navigation.filter((item) => !item.permission || !currentUser || can(currentUser.role, item.permission));

  const sidebar = (
    <>
      <BrandMark inverted />
      <nav className="mt-10 space-y-2 lg:mt-18" aria-label="Primary navigation">
        {permittedNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === active;
          return (
            <Link
              className={cn(
                // Figma: 208x44, 12px padding, 12px gap, 10px radius, 14px/21px, -0.15px tracking.
                // The selected state's 2px border is inset with a ring so it does not
                // change the button's height and shift the whole nav by 4px.
                "flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium tracking-[-0.15px] leading-[21px] transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-foreground ring-2 ring-inset ring-sidebar-muted"
                  : "text-sidebar-muted hover:bg-sidebar-active/70 hover:text-sidebar-foreground",
              )}
              href={item.href}
              key={item.label}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="relative mt-auto border-t border-white/30 pt-6" ref={accountMenuRef}>
        {accountMenuOpen && (
          <div className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] rounded-md border bg-surface p-2 text-foreground shadow-xl" role="menu">
            <button className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setAccountMenuOpen(false); void signOut(); }} role="menuitem" type="button"><LogOut className="size-5" />Logout</button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-muted text-base font-bold text-primary">{initials(currentUser?.name)}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sidebar-foreground">{currentUser?.name ?? "Loading user"}</p>
            <p className="mt-1 text-sm text-sidebar-muted">{currentUser ? roleLabels[currentUser.role] : ""}</p>
          </div>
          <Button aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-label="Open account menu" className="ml-auto shrink-0 text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-foreground" onClick={() => setAccountMenuOpen((open) => !open)} size="icon" variant="ghost">
            <ChevronRight className={`size-6 transition-transform ${accountMenuOpen ? "-rotate-90" : ""}`} />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <CurrentUserProvider user={currentUser}>
      <IdleTimeoutGuard onSignOut={signOut} />
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* Permanent rail from `lg` up. px-9 (36px) against the 280px rail gives the nav
            buttons their 208px Figma width. */}
        <aside className="fixed inset-y-0 hidden w-70 flex-col bg-sidebar px-9 py-10 lg:flex">
          {sidebar}
        </aside>

        {/* Drawer below `lg` — the same sidebar, over an overlay. Always mounted so it can
            transition, and `invisible` when closed so its links stay out of the tab order. */}
        <div className={cn("fixed inset-0 z-40 lg:hidden", sidebarOpen ? "visible" : "pointer-events-none invisible")}>
          <button
            aria-hidden="true"
            className={cn("absolute inset-0 bg-primary/40 backdrop-blur-[1px] transition-opacity duration-200", sidebarOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setSidebarOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <aside
            aria-hidden={!sidebarOpen}
            aria-label="Main menu"
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(17.5rem,85vw)] flex-col overflow-y-auto bg-sidebar px-7 py-8 shadow-2xl transition-transform duration-200 ease-out",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
            id="app-sidebar"
          >
            <button
              aria-label="Close menu"
              className="absolute right-4 top-4 grid size-10 place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-muted"
              onClick={() => setSidebarOpen(false)}
              ref={closeButtonRef}
              type="button"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>

        <div className="min-w-0 lg:col-start-2">
          {/* Search sits left and the bell follows it, leaving the top-right corner free for
              toasts — which is where the Figma flows put them. `bg-surface` is opaque rather
              than /95 + blur so a toast crossing the header edge stays fully legible. */}
          <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b bg-surface px-4 sm:px-5 lg:h-22 lg:px-10">
            <button
              aria-controls="app-sidebar"
              aria-expanded={sidebarOpen}
              aria-label="Open menu"
              className="grid size-11 shrink-0 place-items-center rounded-md border text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu className="size-5" />
            </button>
            <GlobalSearch />
            {/* ml-auto pushes the bell to the header's far-right corner regardless of the
                search box's width, instead of it just trailing wherever search ends. */}
            <div className="ml-auto shrink-0">
              <NotificationCentre currentUser={currentUser} />
            </div>
          </header>
          {/* ToastProvider wraps only `children`, so `useToast()` is available to page
              content. Same rule as `useCurrentUser`: call it in a component rendered as
              AppShell's child, never in the component whose return is <AppShell>. */}
          <main className="min-h-[calc(100vh-5rem)] px-5 py-7 lg:min-h-[calc(100vh-5.5rem)] lg:px-10 lg:py-10">
            <ToastProvider>{children}</ToastProvider>
          </main>
        </div>
      </div>
    </TooltipProvider>
    </CurrentUserProvider>
  );
}
