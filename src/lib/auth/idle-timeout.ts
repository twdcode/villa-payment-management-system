/** How long a session survives with no user interaction. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** How long before the cutoff the warning appears. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;

/** Shared across tabs, so a forgotten second tab cannot keep the session alive. */
export const LAST_ACTIVITY_KEY = "juniper:last-activity";

/**
 * Interactions that count as "the user is still here".
 *
 * Deliberately real input only. Counting timers or background fetches would mean the
 * session never expires, which is the whole point of the timeout.
 */
export const ACTIVITY_EVENTS = ["click", "keydown", "scroll", "touchstart"] as const;

export function readLastActivity(now: number): number {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
    // A missing or corrupt value must not read as "idle since 1970" and sign the user out
    // the moment they load a page.
    return Number.isFinite(value) ? value : now;
  } catch {
    // Private browsing can throw on access. Treat it as active.
    return now;
  }
}

export function writeLastActivity(at: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Storage unavailable — the in-memory timer still runs for this tab.
  }
}

export type IdleState = "active" | "warning" | "expired";

export function idleState(lastActivity: number, now: number): IdleState {
  const idleFor = now - lastActivity;
  if (idleFor >= IDLE_TIMEOUT_MS) return "expired";
  if (idleFor >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) return "warning";
  return "active";
}

/** Whole seconds until sign-out, for the countdown in the warning. */
export function secondsUntilSignOut(lastActivity: number, now: number): number {
  return Math.max(0, Math.ceil((lastActivity + IDLE_TIMEOUT_MS - now) / 1000));
}
