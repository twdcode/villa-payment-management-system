import { vi } from "vitest";
import type { User } from "@/lib/domain/types";

// `server-only` throws outside a bundler's react-server condition — a build-time check,
// not something to reproduce under Vitest. See collections.test.ts for the same call.
vi.mock("server-only", () => ({}));

// Many SupabaseRepository writes call `this.getCurrentUser()` for `created_by` /
// `actor_id` columns, which delegates to `getSessionUser()`. That function talks to
// Supabase Auth in production; here it returns whatever test-local user each test sets
// via `setCurrentTestUser`, which must be a real row already seeded into `public.users`
// so the foreign-key columns resolve against real Postgres, not a mock. Defaults to null
// (not signed in), matching the real function's behaviour with no session.
let currentTestUser: User | null = null;
export function setCurrentTestUser(user: User | null) {
  currentTestUser = user;
}

// The repository under test talks to a REAL Postgres (see run-integration-tests.sh), so
// every pure-`db` method exercises real SQL. Only the handful of methods that reach
// outside Postgres — Supabase Auth's admin API and email sending — are mocked, and each
// test that touches one says so and asserts against the mock, not against a live network
// call.
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => currentTestUser),
}));

vi.mock("@/lib/reminders/send", () => ({
  sendReminderEmail: vi.fn(async () => undefined),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: vi.fn(async ({ email }: { email: string }) => ({
          data: { user: { id: `auth-${email}` } },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: null } })),
    },
  })),
}));
