import "server-only";

import { getPermissionSubject, getSessionUser } from "@/lib/auth/session";
import { can, type Permission, type ScopedResource } from "@/lib/permissions/roles";
import type { User } from "@/lib/domain/types";

/** Thrown when the caller is not signed in, or lacks the permission. */
export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * The signed-in user, or throw.
 *
 * Server actions are public POST endpoints. Anyone can call one directly with curl —
 * hiding the button that triggers it is not access control.
 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("You are not signed in.");
  return user;
}

/**
 * The signed-in user, or throw if they lack this permission.
 *
 * Pass the resource whenever one is in hand. It is ignored while every user is global,
 * and it is what makes scoped roles a change to `canAccess` rather than to every action.
 *
 * **Call this first in every server action.** Not after validation, not after the read —
 * first.
 */
export async function requirePermission(
  permission: Permission,
  resource?: ScopedResource,
): Promise<User> {
  const [user, subject] = await Promise.all([requireUser(), getPermissionSubject()]);
  if (!subject || !can(subject, permission, resource)) throw new AuthorizationError();
  return user;
}

/**
 * Super Admin only. Deleting, cancelling, and workspace settings.
 *
 * Separate from `requirePermission` because these are the actions that destroy or hide
 * data, and they should be obvious in a diff.
 */
export async function requireSuperAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "super_admin") throw new AuthorizationError("Super Admin only.");
  return user;
}
