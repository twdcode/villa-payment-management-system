import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Runs a raw query against a view and returns rows with camelCase keys.
 *
 * Views (`v_stage_position`, `v_villa_position`, `v_receipts`, ...) are not part of the
 * Drizzle schema — they are hand-written SQL, so Drizzle's query builder cannot target
 * them. Postgres returns their columns as the snake_case the SQL defines; every mapper in
 * `mappers.ts` expects camelCase, matching the rest of the codebase. Converting here, once,
 * means no mapper has to special-case "this row came from a view".
 */
export async function queryView<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as Record<string, unknown>[]).map((row) => toCamelRow(row)) as T[];
}

function toCamelRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return out;
}

export { sql };
