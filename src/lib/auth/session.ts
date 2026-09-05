import "server-only";

import { cache } from "react";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/domain/types";
import type { PermissionSubject } from "@/lib/permissions/roles";
import { eq } from "drizzle-orm";

/**
 * The signed-in user, or null.
 *
 * `getClaims()` verifies the JWT signature against Supabase's published keys on every
 * call. `getSession()` reads storage without re-validating, so it can be forged and must
 * never guard anything.
 *
 * Wrapped in React `cache` so one request that checks the session five times still makes
 * one round trip.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (!authUserId) return null;

  // The row is the authority on role and status, not the token. A token minted before a
  // demotion would otherwise keep its old privileges until it expired.
  const [row] = await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);
  if (!row || row.status !== "active") return null;

  return {
    id: row.id,
    name: row.fullName,
    email: row.email,
    role: row.role,
    isActive: row.status === "active",
  };
});

/** The same user, shaped for permission checks. */
export const getPermissionSubject = cache(async (): Promise<PermissionSubject | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (!authUserId) return null;

  const [row] = await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);
  if (!row || row.status !== "active") return null;

  // Assignments stay empty while every user is `global`; `canAccess` short-circuits
  // before it looks at them.
  return { role: row.role, scope: row.scope, assignments: [] };
});
