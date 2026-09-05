import { describe, expect, it } from "vitest";

import { can, canAccess, type Permission } from "@/lib/permissions/roles";
import type { UserRole } from "@/lib/domain/types";

describe("can", () => {
  it("allows what the role permits", () => {
    expect(can("super_admin", "manage_users")).toBe(true);
    expect(can("editor", "record_collections")).toBe(true);
  });

  it("denies what the role does not permit", () => {
    expect(can("editor", "manage_users")).toBe(false);
    expect(can("staff", "manage_projects")).toBe(false);
    expect(can("view_only", "record_collections")).toBe(false);
  });

  it("accepts a bare role or a subject, for the call sites that only know the role", () => {
    expect(can("editor", "manage_villas")).toBe(can({ role: "editor" }, "manage_villas"));
  });
});

describe("canAccess — scope groundwork", () => {
  it("lets a global user reach everything, which is everyone today", () => {
    expect(canAccess({ role: "editor" }, { villaId: "villa-1" })).toBe(true);
    expect(canAccess({ role: "editor", scope: "global" }, { villaId: "anything" })).toBe(true);
  });

  it("limits a scoped user to their assigned villa", () => {
    const user = { role: "editor" as const, scope: "scoped" as const, assignments: [{ villaId: "villa-1" }] };
    expect(canAccess(user, { villaId: "villa-1" })).toBe(true);
    expect(canAccess(user, { villaId: "villa-2" })).toBe(false);
  });

  it("lets a project grant cover villas in that project", () => {
    const user = { role: "editor" as const, scope: "scoped" as const, assignments: [{ projectId: "project-1" }] };
    expect(canAccess(user, { projectId: "project-1", villaId: "villa-9" })).toBe(true);
    expect(canAccess(user, { projectId: "project-2", villaId: "villa-9" })).toBe(false);
  });

  it("denies a scoped user when no resource is given, rather than assuming access", () => {
    expect(canAccess({ role: "editor", scope: "scoped", assignments: [] }, undefined)).toBe(false);
  });

  it("still requires the role to allow the action, whatever the scope", () => {
    const scopedStaff = { role: "staff" as const, scope: "scoped" as const, assignments: [{ villaId: "villa-1" }] };
    expect(can(scopedStaff, "manage_projects", { villaId: "villa-1" })).toBe(false);
    expect(can(scopedStaff, "record_collections", { villaId: "villa-1" })).toBe(true);
  });
});

// Phase 8 authz audit. The whole 4 x 12 matrix, written out rather than derived from
// `rolePermissions` — a test that reads the same table it is checking would pass even
// if that table were wrong. This is the intended policy, stated independently.
describe("role x permission matrix", () => {
  const ALLOW: Record<UserRole, readonly Permission[]> = {
    super_admin: [
      "view_workspace", "manage_projects", "manage_villas", "manage_customers",
      "record_collections", "generate_receipts", "send_reminders", "add_notes",
      "manage_documents", "view_settings", "manage_settings", "manage_users",
    ],
    editor: [
      "view_workspace", "manage_projects", "manage_villas", "manage_customers",
      "record_collections", "generate_receipts", "send_reminders", "add_notes",
      "manage_documents",
    ],
    staff: [
      "view_workspace", "record_collections", "generate_receipts", "send_reminders",
      "add_notes", "manage_documents",
    ],
    view_only: ["view_workspace", "add_notes"],
  };

  const ALL_PERMISSIONS: readonly Permission[] = [
    "view_workspace", "manage_projects", "manage_villas", "manage_customers",
    "record_collections", "generate_receipts", "send_reminders", "add_notes",
    "manage_documents", "view_settings", "manage_settings", "manage_users",
  ];

  for (const role of Object.keys(ALLOW) as UserRole[]) {
    for (const permission of ALL_PERMISSIONS) {
      const expected = ALLOW[role].includes(permission);
      it(`${role} ${expected ? "may" : "may NOT"} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }

  it("only super_admin reaches settings and users", () => {
    for (const permission of ["manage_settings", "manage_users", "view_settings"] as Permission[]) {
      expect(can("super_admin", permission)).toBe(true);
      expect(can("editor", permission)).toBe(false);
      expect(can("staff", permission)).toBe(false);
      expect(can("view_only", permission)).toBe(false);
    }
  });

  it("view_only can never write money or workspace structure", () => {
    for (const permission of ["record_collections", "manage_projects", "manage_villas", "manage_customers"] as Permission[]) {
      expect(can("view_only", permission)).toBe(false);
    }
  });
});
