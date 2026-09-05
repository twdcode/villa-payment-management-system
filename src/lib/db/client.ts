import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * The database connection. SERVER ONLY.
 *
 * `DATABASE_URL` must point at Supabase's **session** pooler (port 5432), NOT the
 * transaction pooler (6543). We use Drizzle over a pooler rather than PostgREST because
 * `recordCollection` has to be one multi-statement transaction, and PostgREST cannot do
 * that.
 *
 * ## Why port 5432 and not 6543
 *
 * The transaction pooler hangs — permanently, not slowly — when a single client sends
 * more concurrent queries than its pool size. Measured against this project, holding
 * everything else constant and changing only the port:
 *
 *   port 6543, max=3, 14 concurrent queries -> HUNG every run (>10s, never returned)
 *   port 5432, max=3, 14 concurrent queries -> ~580ms every run
 *   port 5432, max=5, 140 concurrent queries -> ~745ms
 *
 * The same burst against a local Postgres with max=3 finishes in 18ms, so this is not
 * postgres-js's queueing and not our query patterns — it is specific to the transaction
 * pooler. This surfaced as pages appearing to hang for 90+ seconds whenever more than
 * one person used the app at once: one page load issues ~14 queries, and a single
 * navigation fires two Server Component requests, so even two staff clicking around
 * crossed the threshold.
 *
 * Do not "fix" a recurrence of that by raising `max`. That was tried and it is the wrong
 * lever: each serverless instance gets its own pool, so a large `max` burns the project's
 * 60-connection budget a few warm instances in, and the pooler still hangs at the new
 * threshold. The port is the fix.
 *
 * Never import this from a client component — the connection string is a credential.
 */

declare global {
  var __juniperDb: ReturnType<typeof createClient> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  const client = postgres(url, {
    // Prepared statements work on the session pooler (verified), and are a free win —
    // they were only disabled because the transaction pooler cannot do them.
    prepare: true,
    // Small on purpose. Each serverless instance gets its OWN pool, so this number is
    // multiplied by however many instances are warm; the project's ceiling is 60
    // (`SHOW max_connections`). 5 is ample for 5-10 staff — measured above, the session
    // pooler served 140 concurrent queries at max=5 in under a second.
    max: 5,
  });

  return drizzle(client, { schema });
}

/**
 * Reused across hot reloads in development. Without this, every file change opens a new
 * pool and the connection limit is reached within a few minutes of editing.
 */
export const db = process.env.NODE_ENV === "production" ? createClient() : (globalThis.__juniperDb ??= createClient());

export { schema };
