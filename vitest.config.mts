import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // *.integration.test.ts needs a real Postgres and server-only mocks — see
    // vitest.integration.config.mts / scripts/run-integration-tests.sh. They're
    // deliberately excluded here so the fast unit suite (`npm test`) never depends on
    // Docker being up.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
