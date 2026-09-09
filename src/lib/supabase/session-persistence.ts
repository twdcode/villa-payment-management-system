import type { CookieOptions } from "@supabase/ssr";

/**
 * Marks whether the signed-in user asked to be remembered on this device.
 *
 * Read by the middleware and the server client on every request, so it must be readable
 * by the server — `httpOnly` keeps it out of JavaScript's reach anyway, and it holds no
 * secret: knowing someone ticked a checkbox reveals nothing.
 */
export const REMEMBER_ME_COOKIE = "jv-remember-me";

/** A year. Long enough that "remember me" means it, short enough to eventually expire. */
const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Rewrites Supabase's auth cookie options to match the user's choice.
 *
 * Supabase always writes its auth cookies with a long `Max-Age`, so a session survived a
 * browser restart whether or not the box was ticked — which made the checkbox decorative
 * and, worse, misleading on a shared computer.
 *
 * Unticked: `Max-Age` and `Expires` are stripped, turning them into SESSION cookies that
 * the browser discards when it closes. The refresh token still works while the window
 * stays open, so an active user is never interrupted mid-task; closing the browser is
 * what ends it.
 *
 * Ticked: an explicit year, so the session outlives the browser as the label promises.
 *
 * Only Supabase's own `sb-*` cookies are touched. Anything else passing through keeps its
 * options untouched.
 */
export function applySessionPersistence(name: string, options: CookieOptions, remember: boolean): CookieOptions {
  if (!name.startsWith("sb-")) return options;
  if (remember) return { ...options, maxAge: REMEMBERED_MAX_AGE };

  const { maxAge: _maxAge, expires: _expires, ...sessionOnly } = options;
  return sessionOnly;
}
