import { defineConfig } from "drizzle-kit";

/**
 * Migrations are FILES IN THIS REPO, applied with `drizzle-kit migrate`.
 *
 * Never edit tables in the Supabase dashboard — a dashboard edit is invisible to the
 * migration history, and the client's project would silently diverge from this one at
 * handover.
 */
export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
