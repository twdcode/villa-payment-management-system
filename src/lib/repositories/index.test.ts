import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEY = "NEXT_PUBLIC_DATA_SOURCE";

async function loadDataSource(dataSource?: string) {
  vi.resetModules();
  if (dataSource === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = dataSource;
  return import("@/lib/repositories/data-source");
}

async function loadClientFactory(dataSource?: string) {
  vi.resetModules();
  if (dataSource === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = dataSource;
  return import("@/lib/repositories/client");
}

describe("repository factory", () => {
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("defaults to the mock implementation when the env var is unset", async () => {
    const { getDataSource } = await loadDataSource(undefined);
    expect(getDataSource()).toBe("mock");
  });

  it("falls back to mock for an unrecognised value rather than guessing", async () => {
    const { getDataSource } = await loadDataSource("postgres");
    expect(getDataSource()).toBe("mock");
  });

  it("selects supabase only on an exact match", async () => {
    const { getDataSource } = await loadDataSource("supabase");
    expect(getDataSource()).toBe("supabase");
  });

  // getRepository() (index.ts, server-only) and SupabaseRepository itself cannot be
  // exercised here: both import "server-only", which throws outside Next's own server
  // bundler — it resolves via the "react-server" export condition, which vitest does not
  // set. Covered instead by `npm run build` and by running the read methods against a
  // real database — see DEVELOPMENT-PHASES.md Phase 4.

  it("getClientRepository returns the mock directly", async () => {
    const { getClientRepository } = await loadClientFactory("mock");
    expect(typeof getClientRepository().getDatabase).toBe("function");
  });

  it("getClientRepository returns the same instance on repeat calls", async () => {
    const { getClientRepository } = await loadClientFactory("mock");
    expect(getClientRepository()).toBe(getClientRepository());
  });

  it("getClientRepository refuses to run against supabase, rather than shipping credentials to the browser", async () => {
    const { getClientRepository } = await loadClientFactory("supabase");
    expect(() => getClientRepository()).toThrow(/cannot be used against Supabase/);
  });
});
