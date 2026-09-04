import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEY = "NEXT_PUBLIC_DATA_SOURCE";

async function loadFactory(dataSource?: string) {
  vi.resetModules();
  if (dataSource === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = dataSource;
  return import("@/lib/repositories");
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
    const { getDataSource } = await loadFactory(undefined);
    expect(getDataSource()).toBe("mock");
  });

  it("falls back to mock for an unrecognised value rather than guessing", async () => {
    const { getDataSource } = await loadFactory("postgres");
    expect(getDataSource()).toBe("mock");
  });

  it("selects supabase only on an exact match", async () => {
    const { getDataSource } = await loadFactory("supabase");
    expect(getDataSource()).toBe("supabase");
  });

  it("returns the same instance on repeat calls", async () => {
    const { getRepository } = await loadFactory("mock");
    expect(getRepository()).toBe(getRepository());
  });

  it("satisfies the contract with the mock implementation", async () => {
    const { getRepository } = await loadFactory("mock");
    expect(typeof getRepository().getDatabase).toBe("function");
  });

  it("fails loudly rather than silently when a supabase method is called", async () => {
    const { getRepository } = await loadFactory("supabase");
    // Asserted by name, not by `instanceof`: vi.resetModules() reloads errors.ts, so the
    // thrown class is a different identity from one imported here.
    expect(() => getRepository().getProjects()).toThrow(/getProjects is not implemented/);
  });
});
