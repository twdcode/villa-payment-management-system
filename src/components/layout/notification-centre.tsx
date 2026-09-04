"use client";

import { AlertTriangle, Bell, BellRing, CalendarDays, CheckCircle2, Clock3, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEMO_TODAY } from "@/lib/config/demo";
import type { NotificationType, User, WorkspaceNotification } from "@/lib/domain/types";
import { daysBetween } from "@/lib/finance/calculations";
import { DATABASE_UPDATED_EVENT, getRepository } from "@/lib/repositories";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";

const repository = getRepository();

const notificationIcons: Record<NotificationType, typeof Bell> = {
  payment_approaching: CalendarDays,
  payment_due: Clock3,
  payment_overdue: AlertTriangle,
  final_notice: BellRing,
  payment_recorded: CheckCircle2,
};

const notificationIconClasses: Record<NotificationType, string> = {
  payment_approaching: "bg-warning/10 text-warning",
  payment_due: "bg-surface-muted text-primary",
  payment_overdue: "bg-danger/10 text-danger",
  final_notice: "bg-danger/10 text-danger",
  payment_recorded: "bg-success/10 text-success",
};

function relativeDate(createdAt: string) {
  const createdDate = createdAt.slice(0, 10);
  const age = daysBetween(createdDate, DEMO_TODAY);
  if (age === 0) return "Today";
  if (age === 1) return "Yesterday";
  if (age < 8) return `${age} days ago`;
  return new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${createdDate}T00:00:00.000Z`));
}

function groupLabel(createdAt: string) {
  const age = daysBetween(createdAt.slice(0, 10), DEMO_TODAY);
  if (age === 0) return "Today";
  if (age <= 7) return "Earlier";
  return "Older";
}

function groupNotifications(notifications: WorkspaceNotification[]) {
  return ["Today", "Earlier", "Older"].flatMap((label) => {
    const entries = notifications.filter((notification) => groupLabel(notification.createdAt) === label);
    return entries.length ? [{ label, entries }] : [];
  });
}

export function NotificationCentre({ currentUser }: { currentUser: User | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    try {
      const nextNotifications = await repository.getNotifications();
      setError("");
      setNotifications(nextNotifications);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to load notifications."));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    void repository.getNotifications().then(
      (nextNotifications) => {
        if (!active) return;
        setError("");
        setNotifications(nextNotifications);
        setLoading(false);
      },
      (reason) => {
        if (!active) return;
        setError(errorMessage(reason, "Unable to load notifications."));
        setLoading(false);
      },
    );
    function refreshFromDatabase() { void refresh(); }
    window.addEventListener(DATABASE_UPDATED_EVENT, refreshFromDatabase);
    window.addEventListener("storage", refreshFromDatabase);
    return () => {
      active = false;
      window.removeEventListener(DATABASE_UPDATED_EVENT, refreshFromDatabase);
      window.removeEventListener("storage", refreshFromDatabase);
    };
  }, [currentUser, refresh]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unreadCount = currentUser ? notifications.filter((notification) => !notification.readBy.includes(currentUser.id)).length : 0;
  const groups = groupNotifications(notifications);

  async function openNotification(notification: WorkspaceNotification) {
    setError("");
    try {
      if (currentUser && !notification.readBy.includes(currentUser.id)) {
        const updated = await repository.markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      }
      setOpen(false);
      router.push(notification.href);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to open this notification."));
    }
  }

  async function markAllRead() {
    setError("");
    try {
      setNotifications(await repository.markAllNotificationsRead());
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update notifications."));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative"
            onClick={() => setOpen((current) => !current)}
            ref={triggerRef}
            size="icon"
            variant="outline"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.65rem] font-bold leading-5 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      {open && (
        <section
          aria-label="Notifications"
          className="fixed inset-x-3 top-[4.75rem] z-40 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-lg border bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.75rem)] sm:w-[26rem]"
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Notifications</h2>
              <p className="mt-1 text-xs text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "You are up to date"}</p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && <Button className="h-9 px-2 text-xs" onClick={() => void markAllRead()} variant="ghost">Mark all read</Button>}
              <Button aria-label="Close notifications" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} size="icon" variant="ghost"><X className="size-4" /></Button>
            </div>
          </header>

          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto sm:max-h-[32rem]">
            {loading ? (
              <div className="grid min-h-48 place-items-center px-6 text-sm text-muted-foreground">Loading notifications...</div>
            ) : error ? (
              <div className="grid min-h-48 place-items-center px-6 text-center">
                <div><AlertTriangle className="mx-auto size-7 text-danger" /><p className="mt-3 text-sm font-semibold">Notifications could not be loaded</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><Button className="mt-4" onClick={() => void refresh()} size="sm" variant="outline">Try again</Button></div>
              </div>
            ) : groups.length === 0 ? (
              <div className="grid min-h-52 place-items-center px-6 text-center">
                <div><span className="mx-auto grid size-11 place-items-center rounded-md bg-surface-muted"><Bell className="size-5 text-muted-foreground" /></span><p className="mt-4 font-semibold">No notifications</p><p className="mt-1 text-sm text-muted-foreground">New payment alerts will appear here.</p></div>
              </div>
            ) : (
              <div className="divide-y">
                {groups.map((group) => (
                  <section key={group.label}>
                    <h3 className="bg-surface-subtle px-5 py-2 text-xs font-semibold uppercase text-muted-foreground">{group.label}</h3>
                    <div className="divide-y">
                      {group.entries.map((notification) => {
                        const Icon = notificationIcons[notification.type];
                        const unread = currentUser ? !notification.readBy.includes(currentUser.id) : false;
                        return (
                          <button
                            className={cn("flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", unread && "bg-surface-subtle")}
                            key={notification.id}
                            onClick={() => void openNotification(notification)}
                            type="button"
                          >
                            <span className={cn("grid size-10 shrink-0 place-items-center rounded-md", notificationIconClasses[notification.type])}><Icon className="size-5" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-semibold leading-5">{notification.title}</span>{unread && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />}</span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
                              <span className="mt-2 block text-xs font-medium text-muted-foreground">{relativeDate(notification.createdAt)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      <span aria-live="polite" className="sr-only">{unreadCount} unread notifications</span>
    </div>
  );
}
