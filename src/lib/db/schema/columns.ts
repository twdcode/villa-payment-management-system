import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column builders. Defining money in one place is the point: a single
 * `numeric(18,2)` here is worth more than the same literal repeated 30 times, because
 * one of those 30 eventually gets typed as `real` and silently loses cents.
 */

/**
 * Money. LKR, exact decimal, never float.
 *
 * `mode: "string"` keeps the value as a string end to end. Drizzle would otherwise hand
 * back a JS `number`, which is binary floating point — the exact thing `numeric` exists
 * to avoid. Parse to a number only for display, never for arithmetic.
 */
export const money = (name: string) => numeric(name, { precision: 18, scale: 2, mode: "string" });

/**
 * An interest rate as a FRACTION: 0.015000 = 1.5%.
 *
 * Not a percent. The frontend already uses fractions, and mixing the conventions makes
 * every interest figure 100x wrong. A CHECK constraint on each table rejects any value
 * >= 1, so a percent typed here fails loudly.
 */
export const rate = (name: string) => numeric(name, { precision: 8, scale: 6, mode: "string" });

/** `created_at` / `updated_at`, always timezone-aware. */
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Who did it. Nullable: seeded and system-generated rows have no author. */
export const actor = (name: string) => uuid(name);
