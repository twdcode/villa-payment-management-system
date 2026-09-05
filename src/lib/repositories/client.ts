import "client-only";

import { createLocalStorageRepository } from "@/lib/repositories/local-storage-repository";
import { getDataSource } from "@/lib/repositories/data-source";

import type { Repository } from "./contracts";

let instance: Repository | null = null;

/**
 * What a Client Component may call directly.
 *
 * This file has NO import path, static or dynamic, to `supabase-repository.ts` — that is
 * the point. A bundler includes a module in the client bundle if it is reachable from a
 * client component through ANY path, including inside a function body; a dynamic
 * `import()` of the Supabase repository sitting in the same file as this function was
 * enough to pull `server-only`, `next/headers` and the `postgres` driver into the browser
 * bundle, because the bundler cannot prove that branch is unreachable for a given page.
 *
 * Physically separating "safe for the client" from "loads the Supabase repository" is
 * what actually keeps database credentials out of the browser — a runtime `if` was not
 * enough.
 *
 * Only ever resolves to the mock. In Supabase mode this throws rather than allowing a
 * component to accidentally reach for server-only code — the fix for that call site is to
 * move it to a Server Component (reads) or a server action (writes). See
 * `getRepository()` in `index.ts` for the server-side equivalent, and Phase 4/5/6 in
 * `DEVELOPMENT-PHASES.md` for which call sites still need moving.
 */
export function getClientRepository(): Repository {
  if (getDataSource() === "supabase") {
    throw new Error(
      "getClientRepository() cannot be used against Supabase — that would ship database " +
        "credentials to the browser. This call site needs to move to a Server Component " +
        "or a server action.",
    );
  }
  instance ??= createLocalStorageRepository();
  return instance;
}

/** Test-only. Drops the cached instance so a test can re-select the data source. */
export function resetClientRepository(): void {
  instance = null;
}
