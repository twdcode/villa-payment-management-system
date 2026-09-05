import "server-only";

import { createLocalStorageRepository } from "@/lib/repositories/local-storage-repository";
import { getDataSource } from "@/lib/repositories/data-source";

import type { Repository } from "./contracts";

let instance: Repository | null = null;

/**
 * The single way to reach the data layer, for code that already runs on the server —
 * a Server Component, a Server Action, a route handler.
 *
 * SERVER ONLY, enforced by the `server-only` import above: bundling this into a Client
 * Component now fails the build instead of silently shipping database credentials.
 *
 * Client Components must use `getClientRepository()` in `client.ts` instead — a separate
 * file with no path to `supabase-repository.ts`, static or dynamic. That separation, not
 * a runtime `if`, is what actually keeps the Supabase implementation out of the browser
 * bundle: a bundler includes a module in the client graph if it is reachable from a
 * client component through any path, including a conditional dynamic import.
 */
export async function getRepository(): Promise<Repository> {
  if (instance) return instance;
  if (getDataSource() === "supabase") {
    const { createSupabaseRepository } = await import("@/lib/repositories/supabase-repository");
    instance = createSupabaseRepository();
  } else {
    instance = createLocalStorageRepository();
  }
  return instance;
}

/** Test-only. Drops the cached instance so a test can re-select the data source. */
export function resetRepository(): void {
  instance = null;
}

export { getDataSource } from "@/lib/repositories/data-source";
export type { DataSource } from "@/lib/repositories/data-source";
export { DATABASE_UPDATED_EVENT } from "@/lib/repositories/events";
export type { Repository } from "./contracts";
