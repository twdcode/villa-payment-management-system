import "server-only";

/**
 * Per-address throttle for password reset requests.
 *
 * Supabase already rate-limits its own mail sending, but that quota is GLOBAL: one script
 * hammering the form exhausts it for every legitimate user, which is exactly what happened
 * during testing. Throttling per address keeps one abusive target from denying everyone
 * else a reset link, and stops the form being used to flood somebody's inbox.
 *
 * In-memory on purpose. A shared store (Redis, a table) would survive restarts and cover
 * multiple instances, but this runs as a single Vercel deployment and the failure mode of
 * a cold start is simply that one extra email may be sent — acceptable, where a new
 * dependency for this alone is not. Revisit if the app is ever scaled horizontally.
 *
 * Keyed by address, never by IP: a shared office NAT would otherwise let one colleague's
 * request block the rest of the team.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 3;

const attempts = new Map<string, number[]>();

/**
 * Records an attempt and reports whether it is allowed.
 *
 * Always call this BEFORE sending, and treat `false` as "pretend it worked" — telling the
 * caller they have been throttled confirms the address is worth throttling, which is the
 * enumeration leak the neutral success message exists to prevent.
 */
export function allowPasswordResetRequest(email: string): boolean {
  const now = Date.now();
  const key = email.trim().toLowerCase();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  // Swept on write rather than on a timer: the map only grows when someone asks for a
  // reset, and every entry is either refreshed or dropped the next time that address is
  // seen, so an unbounded set of one-off addresses cannot accumulate indefinitely.
  if (attempts.size > 5_000) {
    for (const [entry, times] of attempts) {
      if (times.every((at) => now - at >= WINDOW_MS)) attempts.delete(entry);
    }
  }

  if (recent.length >= MAX_PER_WINDOW) {
    attempts.set(key, recent);
    return false;
  }

  attempts.set(key, [...recent, now]);
  return true;
}
