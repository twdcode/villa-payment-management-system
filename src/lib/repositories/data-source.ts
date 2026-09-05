export type DataSource = "mock" | "supabase";

/**
 * Which implementation the app runs against. Defaults to `mock` so a missing or misspelt
 * env var can never silently point production code at an unfinished backend.
 *
 * Deliberately its own file with zero other imports: both `index.ts` (server) and
 * `client.ts` (browser-safe) need this function, and importing it from either of the
 * repository files would drag that file's other dependencies along.
 */
export function getDataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? "supabase" : "mock";
}
