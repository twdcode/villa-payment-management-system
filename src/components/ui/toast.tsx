"use client";

import { CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Toasts for create/edit/delete confirmations.
 *
 * Replaces the four near-identical `role="status"` blocks that each page had grown its
 * own copy of — same markup, different corners, different z-indexes, different auto
 * dismiss behaviour. One implementation means "Successfully created new project" looks
 * and behaves the same everywhere, which is what the Figma flows show.
 *
 * Styling follows the design: a light tinted panel with dark text and an icon, top-right
 * under the header — not the solid-green bar the ad-hoc versions used.
 */
type ToastTone = "success" | "error";

type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  /** Show a confirmation. Auto-dismisses; returns immediately. */
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Long enough to read a sentence, short enough not to sit over the next action. */
const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Timers are cleared on unmount so a toast fired just before navigation cannot call
  // setState on an unmounted provider.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_AFTER_MS));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `aria-live="polite"` so a screen reader announces the confirmation without
          interrupting whatever the user is doing. */}
      {/* Top-right, sitting in the header band, as the Figma flows show. The header's own
          controls were moved left to clear this corner, so nothing underneath is covered.
          On small screens it spans the width below the header instead, where the bottom is
          occupied by the mobile nav bar.
          `pointer-events-none` on the stack keeps clicks passing through to the page;
          only the toast itself is interactive. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-4 z-100 flex flex-col items-center gap-3 sm:inset-x-auto sm:right-6 sm:top-5 sm:items-end sm:max-w-md">
        {toasts.map((item) => {
          const Icon = item.tone === "error" ? CircleAlert : Info;
          return (
            <div
              // Opaque fills, not the /10 tints used before: the toast overlaps page content
              // at this position, and a translucent panel let text show through it.
              className={`pointer-events-auto flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-sm font-medium shadow-lg ${
                item.tone === "error"
                  ? "border-danger/30 bg-danger-subtle text-foreground"
                  : "border-success/30 bg-success-subtle text-foreground"
              }`}
              key={item.id}
              role={item.tone === "error" ? "alert" : "status"}
            >
              <Icon aria-hidden="true" className={`size-5 shrink-0 ${item.tone === "error" ? "text-danger" : "text-success"}`} />
              <span className="min-w-0 flex-1">{item.message}</span>
              <button
                aria-label="Dismiss notification"
                className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={() => dismiss(item.id)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Show a toast. Must be called under `ToastProvider`, which `AppShell` mounts — so every
 * authenticated page has it without wiring anything up.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast used outside ToastProvider.");
  return context;
}
