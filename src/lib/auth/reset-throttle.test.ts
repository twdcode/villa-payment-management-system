import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allowPasswordResetRequest } from "@/lib/auth/reset-throttle";

// A fresh address per test: the throttle keeps module-level state by design, so reusing
// one across tests would leak attempts between them.
let counter = 0;
const freshEmail = () => `user${counter++}@example.com`;

describe("allowPasswordResetRequest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows the first three requests and blocks the fourth", () => {
    const email = freshEmail();
    expect(allowPasswordResetRequest(email)).toBe(true);
    expect(allowPasswordResetRequest(email)).toBe(true);
    expect(allowPasswordResetRequest(email)).toBe(true);
    expect(allowPasswordResetRequest(email)).toBe(false);
  });

  it("allows again once the window has passed", () => {
    const email = freshEmail();
    for (let i = 0; i < 3; i += 1) allowPasswordResetRequest(email);
    expect(allowPasswordResetRequest(email)).toBe(false);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(allowPasswordResetRequest(email)).toBe(true);
  });

  it("throttles each address separately", () => {
    const blocked = freshEmail();
    for (let i = 0; i < 3; i += 1) allowPasswordResetRequest(blocked);
    expect(allowPasswordResetRequest(blocked)).toBe(false);
    // One person exhausting their own allowance must not lock anyone else out.
    expect(allowPasswordResetRequest(freshEmail())).toBe(true);
  });

  it("treats case and surrounding space as the same address", () => {
    const email = freshEmail();
    allowPasswordResetRequest(email);
    allowPasswordResetRequest(`  ${email.toUpperCase()}  `);
    allowPasswordResetRequest(email);
    expect(allowPasswordResetRequest(email)).toBe(false);
  });
});
