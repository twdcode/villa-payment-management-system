import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * The database connection. SERVER ONLY.
 *
 * `DATABASE_URL` points at Supabase's transaction pooler (port 6543). We use Drizzle over
 * the pooler rather than PostgREST because `recordCollection` has to be one multi-statement
 * transaction, and PostgREST cannot do that.
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
    // The transaction pooler does not support prepared statements.
    prepare: false,
    // Serverless functions are short-lived; a large pool per instance exhausts the
    // database's connection limit long before it helps.
    max: 1,
  });

  return drizzle(client, { schema });
}

/**
 * Reused across hot reloads in development. Without this, every file change opens a new
 * pool and the connection limit is reached within a few minutes of editing.
 */
export const db = process.env.NODE_ENV === "production" ? createClient() : (globalThis.__juniperDb ??= createClient());

export { schema };
