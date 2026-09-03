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

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}
