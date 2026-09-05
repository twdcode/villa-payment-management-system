"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireUser, AuthorizationError } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { CollectionResult, CollectionInput, CollectionUpdateInput } from "@/lib/repositories/contracts";

function revalidateMoneyPaths(projectId: string, villaId: string) {
  revalidatePath("/collections");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/villas/${villaId}`);
}

export async function recordCollectionAction(input: CollectionInput): Promise<CollectionResult> {
  await requirePermission("record_collections", { projectId: input.projectId, villaId: input.villaId });
  const result = await (await getRepository()).recordCollection(input);
  revalidateMoneyPaths(input.projectId, input.villaId);
  return result;
}

/**
 * C1/E10 — correct a collection. Super Admin and Editor only.
 *
 * Staff may record a payment but not edit one: recording is the job, editing rewrites
 * money that has already been receipted. `record_collections` is deliberately not enough
 * here, which is why this checks the role directly rather than reusing that permission.
 */
export async function updateCollectionAction(
  id: string,
  input: CollectionUpdateInput,
  reason: string,
): Promise<CollectionResult> {
  const user = await requireUser();
  if (user.role !== "super_admin" && user.role !== "editor") {
    throw new AuthorizationError("Only a Super Admin or Editor can correct a collection.");
  }
  const result = await (await getRepository()).updateCollection(id, input, reason);
  revalidateMoneyPaths(input.projectId, input.villaId);
  return result;
}
