import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws when a bundler's react-server condition is missing, which is how
// Next enforces the client/server boundary at build time — not something to reproduce in
// a unit test. Standard practice for testing server-only modules under Vitest.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  getPermissionSubject: vi.fn(),
}));
vi.mock("@/lib/repositories", () => ({
  getRepository: vi.fn(),
}));

import { getSessionUser, getPermissionSubject } from "@/lib/auth/session";
import { getRepository } from "@/lib/repositories";
import type { UserRole } from "@/lib/domain/types";
import type { CollectionUpdateInput } from "@/lib/repositories/contracts";

function userWithRole(role: UserRole) {
  return { id: "u1", name: "Test User", email: "user@example.com", role, isActive: true };
}

const updateInput: CollectionUpdateInput = {
  projectId: "project-1",
  villaId: "villa-1",
  customerId: "customer-1",
  paymentDate: "2026-08-28",
  paymentMethod: "cash",
  referenceNumber: "",
  amount: 100_000,
};

describe("updateCollectionAction — C1/E10 authz", () => {
  let updateCollection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    updateCollection = vi.fn().mockResolvedValue({ collection: { id: "c1" } });
    vi.mocked(getRepository).mockResolvedValue({ updateCollection } as never);
    vi.mocked(getPermissionSubject).mockResolvedValue({ role: "staff" });
  });

  // The rule this test suite exists to lock: Staff may RECORD a collection but never
  // EDIT one, because editing rewrites money that has already been receipted. This
  // action checks `user.role` directly rather than a shared `can()` permission, so
  // the role/permission matrix in permissions/roles.test.ts does not cover it — this
  // is the only place that rule is verified.
  it("rejects Staff", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(userWithRole("staff"));
    const { updateCollectionAction } = await import("@/lib/actions/collections");

    await expect(updateCollectionAction("c1", updateInput, "reason")).rejects.toThrow("Super Admin or Editor");
    expect(updateCollection).not.toHaveBeenCalled();
  });

  it("rejects View Only", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(userWithRole("view_only"));
    const { updateCollectionAction } = await import("@/lib/actions/collections");

    await expect(updateCollectionAction("c1", updateInput, "reason")).rejects.toThrow("Super Admin or Editor");
    expect(updateCollection).not.toHaveBeenCalled();
  });

  it("allows Editor", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(userWithRole("editor"));
    const { updateCollectionAction } = await import("@/lib/actions/collections");

    await updateCollectionAction("c1", updateInput, "reason");
    expect(updateCollection).toHaveBeenCalledWith("c1", updateInput, "reason");
  });

  it("allows Super Admin", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(userWithRole("super_admin"));
    const { updateCollectionAction } = await import("@/lib/actions/collections");

    await updateCollectionAction("c1", updateInput, "reason");
    expect(updateCollection).toHaveBeenCalledWith("c1", updateInput, "reason");
  });

  it("rejects when not signed in at all", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const { updateCollectionAction } = await import("@/lib/actions/collections");

    await expect(updateCollectionAction("c1", updateInput, "reason")).rejects.toThrow("not signed in");
    expect(updateCollection).not.toHaveBeenCalled();
  });
});

describe("recordCollectionAction — permission gate is real, not decorative", () => {
  it("calls requirePermission with the villa/project scope, and denies when it fails", async () => {
    vi.resetModules();
    vi.mocked(getSessionUser).mockResolvedValue(userWithRole("view_only"));
    vi.mocked(getPermissionSubject).mockResolvedValue({ role: "view_only" });
    const recordCollection = vi.fn();
    vi.mocked(getRepository).mockResolvedValue({ recordCollection } as never);

    const { recordCollectionAction } = await import("@/lib/actions/collections");
    const input = { ...updateInput, idempotencyKey: "key-1" };

    await expect(recordCollectionAction(input)).rejects.toThrow();
    expect(recordCollection).not.toHaveBeenCalled();
  });
});
