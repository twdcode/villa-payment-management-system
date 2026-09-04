import { createLocalStorageRepository } from "@/lib/repositories/local-storage-repository";
import { createSupabaseRepository } from "@/lib/repositories/supabase-repository";

import type { Repository } from "./contracts";

export type DataSource = "mock" | "supabase";

/**
 * Which implementation the app runs against. Defaults to `mock` so a missing or misspelt
 * env var can never silently point production code at an unfinished backend.
 */
export function getDataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? "supabase" : "mock";
}

let instance: Repository | null = null;

/**
 * The single way to reach the data layer. Nothing outside this folder should import a
 * concrete repository — swapping the backend has to be one env var, not 50 edits.
 */
export function getRepository(): Repository {
  instance ??= getDataSource() === "supabase" ? createSupabaseRepository() : createLocalStorageRepository();
  return instance;
}

/** Test-only. Drops the cached instance so a test can re-select the data source. */
export function resetRepository(): void {
  instance = null;
}

export { DATABASE_UPDATED_EVENT } from "@/lib/repositories/events";
export type { Repository } from "./contracts";
