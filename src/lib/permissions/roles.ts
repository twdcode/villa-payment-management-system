import type { UserRole } from "@/lib/domain/types";

export type Permission =
  | "view_workspace"
  | "manage_projects"
  | "manage_villas"
  | "manage_customers"
  | "record_collections"
  | "generate_receipts"
  | "send_reminders"
  | "add_notes"
  | "manage_documents"
  | "view_settings"
  | "manage_settings"
  | "manage_users";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  super_admin: [
    "view_workspace",
    "manage_projects",
    "manage_villas",
    "manage_customers",
    "record_collections",
    "generate_receipts",
    "send_reminders",
    "add_notes",
    "manage_documents",
    "view_settings",
    "manage_settings",
    "manage_users",
  ],
  editor: [
    "view_workspace",
    "manage_projects",
    "manage_villas",
    "manage_customers",
    "record_collections",
    "generate_receipts",
    "send_reminders",
    "add_notes",
    "manage_documents",
  ],
  staff: [
    "view_workspace",
    "record_collections",
    "generate_receipts",
    "send_reminders",
    "add_notes",
    "manage_documents",
  ],
  view_only: ["view_workspace", "add_notes"],
};

export const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  editor: "Editor",
  staff: "Staff",
  view_only: "View Only",
};

/**
 * A resource a permission check can be scoped to.
 *
 * Ignored today — every user is `global`. It is in the signature now so that adding
 * per-project or per-villa roles later is a change to `canAccess` alone, instead of an
 * edit to every call site in the app. See SCOPED-ROLES.md.
 */
export type ScopedResource = { projectId?: string; villaId?: string };

/** How much of the workspace a user can reach. Everyone is `global` today. */
export type AccessScope = "global" | "scoped";

export type PermissionSubject = {
  role: UserRole;
  scope?: AccessScope;
  /** Project and villa ids granted to a scoped user. Empty while everyone is global. */
  assignments?: ScopedResource[];
};

/**
 * Can this user reach this particular record?
 *
 * Returns true immediately for a `global` user, which is everyone right now — no lookup,
 * no query, no cost. The `scope` value travels with the session, so this stays a plain
 * boolean check.
 */
export function canAccess(subject: PermissionSubject, resource?: ScopedResource): boolean {
  if ((subject.scope ?? "global") === "global") return true;
  if (!resource) return false;
  return (subject.assignments ?? []).some(
    (grant) =>
      (grant.villaId && grant.villaId === resource.villaId) ||
      (grant.projectId && grant.projectId === resource.projectId),
  );
}

/**
 * Does this user have this permission on this record?
 *
 * Two questions, deliberately kept separate: does the ROLE allow the action, and can the
 * USER reach the record? Today the second always answers yes.
 *
 * Accepts a bare role for the many call sites that only ask about the role. Pass the
 * resource whenever one is in hand — it costs nothing now and is what makes scoped roles
 * a one-function change later.
 */
export function can(
  subject: UserRole | PermissionSubject,
  permission: Permission,
  resource?: ScopedResource,
): boolean {
  const user: PermissionSubject = typeof subject === "string" ? { role: subject } : subject;
  if (!rolePermissions[user.role].includes(permission)) return false;
  return canAccess(user, resource);
}
