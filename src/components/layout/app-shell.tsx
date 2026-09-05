"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, CreditCard, Home, LayoutDashboard, LogOut, MoreHorizontal, Search, Settings, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
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

type AppShellProps = { children: React.ReactNode; active?: string };

export function AppShell({ children, active = "Dashboard" }: AppShellProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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
    function closeOnOutsideClick(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const permittedNavigation = navigation.filter((item) => !item.permission || !currentUser || can(currentUser.role, item.permission));
  // Mobile bar fits 4 direct tabs comfortably; anything past that (Settings, and Collections
  // for roles that have it) goes under "More" instead of silently disappearing off the slice.
  const mobileNavigation = permittedNavigation.slice(0, 4);
  const overflowNavigation = permittedNavigation.slice(4);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

  return (
    <CurrentUserProvider user={currentUser}>
      <IdleTimeoutGuard onSignOut={signOut} />
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* px-9 (36px) against the 280px rail gives the nav buttons their 208px Figma width. */}
        <aside className="fixed inset-y-0 hidden w-70 flex-col bg-sidebar px-9 py-10 lg:flex">
          <BrandMark inverted />
          <nav className="mt-18 space-y-2" aria-label="Primary navigation">
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
              <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-base font-bold text-primary">VS</span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sidebar-foreground">{currentUser?.name ?? "Loading user"}</p>
                <p className="mt-1 text-sm text-sidebar-muted">{currentUser ? roleLabels[currentUser.role] : ""}</p>
              </div>
              <Button aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-label="Open account menu" className="ml-auto text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-foreground" onClick={() => setAccountMenuOpen((open) => !open)} size="icon" variant="ghost">
                <ChevronRight className={`size-6 transition-transform ${accountMenuOpen ? "-rotate-90" : ""}`} />
              </Button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-2">
          {/* No mobile menu button: small screens navigate with the fixed bottom bar
              below, so a hamburger would open nothing. Kept out rather than wired to a
              drawer that duplicates navigation the user can already see. */}
          {/* Search sits left and the bell follows it, leaving the top-right corner free for
              toasts — which is where the Figma flows put them. `bg-surface` is opaque rather
              than /95 + blur so a toast crossing the header edge stays fully legible. */}
          <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b bg-surface px-5 lg:h-22 lg:px-10">
            <label className="relative max-w-xl flex-1 lg:flex-initial lg:w-96">
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input className="h-11 w-full rounded-md border bg-surface pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" placeholder="Search customer, villa, receipt..." type="search" />
            </label>
            <NotificationCentre currentUser={currentUser} />
          </header>
          {/* ToastProvider wraps only `children`, so `useToast()` is available to page
              content. Same rule as `useCurrentUser`: call it in a component rendered as
              AppShell's child, never in the component whose return is <AppShell>. */}
          <main className="min-h-[calc(100vh-5rem)] px-5 py-7 pb-27 lg:min-h-[calc(100vh-5.5rem)] lg:px-10 lg:py-10 lg:pb-10">
            <ToastProvider>{children}</ToastProvider>
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 border-t bg-surface px-2 lg:hidden" aria-label="Mobile navigation">
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === active;
            return (
              <Link className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.69rem] font-medium", isActive ? "text-primary" : "text-muted-foreground")} href={item.href} key={item.label}>
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                <span className="truncate">{item.label === "Projects & Villas" ? "Projects" : item.label}</span>
              </Link>
            );
          })}
          {overflowNavigation.length > 0 && (
            <div className="relative flex min-w-0 flex-1" ref={moreMenuRef}>
              {moreMenuOpen && (
                <div className="absolute inset-x-2 bottom-[calc(100%+0.5rem)] rounded-md border bg-surface p-1.5 text-foreground shadow-xl" role="menu">
                  {overflowNavigation.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-surface-muted", item.label === active ? "text-primary" : "text-foreground")}
                        href={item.href}
                        key={item.label}
                        onClick={() => setMoreMenuOpen(false)}
                        role="menuitem"
                      >
                        <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
              <button
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.69rem] font-medium", overflowNavigation.some((item) => item.label === active) ? "text-primary" : "text-muted-foreground")}
                onClick={() => setMoreMenuOpen((open) => !open)}
                type="button"
              >
                <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.8} />
                <span>More</span>
              </button>
            </div>
          )}
        </nav>
      </div>
    </TooltipProvider>
    </CurrentUserProvider>
  );
}
