import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.mts on purpose: these tests hit a real Postgres over the
// network and take ~10x longer than the unit suite. Keeping them out of `npm test` means
// the fast suite stays fast; `npm run test:integration` runs this config explicitly, via
// scripts/run-integration-tests.sh, which starts and tears down the database.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./src/lib/repositories/supabase-repository.integration.setup.ts"],
    // record_collection() locks the villa row FOR UPDATE — tests in the same file often
    // share fixtures deliberately, but different files must not interleave.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
