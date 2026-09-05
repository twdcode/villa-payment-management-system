import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components.
 *
 * Uses the PUBLISHABLE key, which is safe to ship to the browser — it can do nothing that
 * RLS does not already allow. The secret key must never appear in this file or any file
 * that reaches the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
