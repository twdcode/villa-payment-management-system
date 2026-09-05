import { describe, expect, it } from "vitest";

import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, idleState, secondsUntilSignOut } from "@/lib/auth/idle-timeout";

const NOW = 1_800_000_000_000;

describe("idleState", () => {
  it("is active immediately after interaction", () => {
    expect(idleState(NOW, NOW)).toBe("active");
  });

  it("is active at 27 minutes", () => {
    expect(idleState(NOW - 27 * 60_000, NOW)).toBe("active");
  });

  it("warns at 28 minutes, before signing anyone out", () => {
    expect(idleState(NOW - (IDLE_TIMEOUT_MS - IDLE_WARNING_MS), NOW)).toBe("warning");
  });

  it("expires at exactly 30 minutes", () => {
    expect(idleState(NOW - IDLE_TIMEOUT_MS, NOW)).toBe("expired");
  });

  it("stays expired well past the cutoff", () => {
    expect(idleState(NOW - 5 * IDLE_TIMEOUT_MS, NOW)).toBe("expired");
  });
});

describe("secondsUntilSignOut", () => {
  it("counts down from the full timeout", () => {
    expect(secondsUntilSignOut(NOW, NOW)).toBe(IDLE_TIMEOUT_MS / 1000);
  });

  it("reports 120 seconds when the warning appears", () => {
    expect(secondsUntilSignOut(NOW - (IDLE_TIMEOUT_MS - IDLE_WARNING_MS), NOW)).toBe(120);
  });

  it("never goes negative", () => {
    expect(secondsUntilSignOut(NOW - 2 * IDLE_TIMEOUT_MS, NOW)).toBe(0);
  });
});
