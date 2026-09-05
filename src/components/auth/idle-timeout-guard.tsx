"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ACTIVITY_EVENTS,
  idleState,
  readLastActivity,
  secondsUntilSignOut,
  writeLastActivity,
} from "@/lib/auth/idle-timeout";

/**
 * Signs the user out after 30 minutes with no interaction.
 *
 * Token expiry alone would never do this — `@supabase/ssr` refreshes silently in the
 * background, so a tab left open stays authenticated indefinitely. Inactivity has to be
 * tracked separately.
 *
 * A warning appears two minutes before the cutoff. Losing a half-typed collection to a
 * silent logout is worse than the timeout itself.
 */
export function IdleTimeoutGuard({ onSignOut }: { onSignOut: () => void }) {
  const [warning, setWarning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Ref, not state: this fires from an event handler on every click and must not re-render.
  const signedOut = useRef(false);

  const markActive = useCallback(() => {
    if (signedOut.current) return;
    writeLastActivity(Date.now());
    setWarning(false);
  }, []);

  useEffect(() => {
    markActive();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true });
    }

    // Coming back to a tab counts as being here; leaving it does not.
    const onVisible = () => document.visibilityState === "visible" && markActive();
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => {
      if (signedOut.current) return;
      const now = Date.now();
      // Read from storage, not memory: activity in ANY tab keeps the session alive.
      const last = readLastActivity(now);
      const state = idleState(last, now);

      if (state === "expired") {
        signedOut.current = true;
        onSignOut();
        return;
      }
      setWarning(state === "warning");
      if (state === "warning") setSeconds(secondsUntilSignOut(last, now));
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [markActive, onSignOut]);

  if (!warning) return null;

  return (
    <div
      className="fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-3 rounded-lg border border-danger bg-surface px-4 py-4 text-sm font-medium shadow-lg"
      role="alertdialog"
      aria-live="assertive"
    >
      <span>
        You will be signed out in {seconds} second{seconds === 1 ? "" : "s"} due to inactivity.
      </span>
      <Button onClick={markActive} size="sm">
        Stay signed in
      </Button>
    </div>
  );
}
