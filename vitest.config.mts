import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a Server Component, which is the whole
      // point of it — but that also stops the unit runner from importing any module that
      // guards itself this way. Stubbed here only; the real package still protects the
      // application build.
      "server-only": fileURLToPath(new URL("./src/lib/testing/server-only-stub.ts", import.meta.url)),
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
