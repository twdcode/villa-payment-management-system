import "server-only";

import type { Repository } from "./contracts";

let instance: Repository | null = null;

/**
 * The single way to reach the data layer, for code that already runs on the server —
 * a Server Component, a Server Action, a route handler.
 *
 * SERVER ONLY, enforced by the `server-only` import above: bundling this into a Client
 * Component now fails the build instead of silently shipping database credentials.
 *
 * There used to be a mock, localStorage-backed implementation selected by
 * `NEXT_PUBLIC_DATA_SOURCE`. It is gone — the app only ever talks to Supabase now, and
 * carrying two implementations meant bugs specific to the real one (see
 * `DEVELOPMENT-PHASES.md` Phase 9) went unnoticed because manual testing mostly
 * exercised the mock. If you need sample data for a test, `lib/testing/fixtures.ts` has
 * it — it is fixture data now, not a product mode.
 */
export async function getRepository(): Promise<Repository> {
  if (instance) return instance;
  const { createSupabaseRepository } = await import("@/lib/repositories/supabase-repository");
  instance = createSupabaseRepository();
  return instance;
}

/** Test-only. Drops the cached instance so a test can get a fresh repository. */
export function resetRepository(): void {
  instance = null;
}

export type { Repository } from "./contracts";
