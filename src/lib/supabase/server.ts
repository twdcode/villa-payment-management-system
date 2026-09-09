import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { applySessionPersistence, REMEMBER_ME_COOKIE } from "@/lib/supabase/session-persistence";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A new instance per request — creating one is cheap, and sharing an instance across
 * requests would leak one user's session into another's.
 *
 * Sessions live in httpOnly cookies, so JavaScript cannot read them. That is the whole
 * point of `@supabase/ssr`: a token in localStorage is readable by any XSS payload.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const remember = cookieStore.get(REMEMBER_ME_COOKIE)?.value === "1";
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, applySessionPersistence(name, options, remember));
            }
          } catch {
            // Server Components cannot write cookies. The proxy refreshes the session
            // instead, so this is safe to ignore here.
          }
        },
      },
    },
  );
}
