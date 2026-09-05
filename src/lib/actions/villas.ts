"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSuperAdmin } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { PaymentSchedule, Villa } from "@/lib/domain/types";
import type { DocumentLinkInput, PaymentScheduleUpdateInput, VillaInterestTermsInput, VillaSetupInput, VillaSetupResult } from "@/lib/repositories/contracts";

export async function completeVillaSetupAction(input: VillaSetupInput): Promise<VillaSetupResult> {
  await requirePermission("manage_villas", { projectId: input.projectId });
  const result = await (await getRepository()).completeVillaSetup(input);
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/villas");
  return result;
}

export async function updatePaymentScheduleAction(villaId: string, schedules: PaymentScheduleUpdateInput[]): Promise<PaymentSchedule[]> {
  await requirePermission("manage_villas", { villaId });
  const result = await (await getRepository()).updatePaymentSchedule(villaId, schedules);
  revalidatePath(`/projects`);
  return result;
}

export async function updateVillaInterestTermsAction(villaId: string, input: VillaInterestTermsInput): Promise<Villa> {
  await requirePermission("manage_villas", { villaId });
  const villa = await (await getRepository()).updateVillaInterestTerms(villaId, input);
  revalidatePath(`/projects`);
  return villa;
}

export async function addVillaDocumentAction(villaId: string, input: DocumentLinkInput): Promise<void> {
  await requirePermission("manage_documents", { villaId });
  await (await getRepository()).addVillaDocument(villaId, input);
  revalidatePath(`/projects`);
}

export async function addVillaNoteAction(villaId: string, content: string): Promise<void> {
  await requirePermission("add_notes", { villaId });
  await (await getRepository()).addVillaNote(villaId, content);
  revalidatePath(`/projects`);
}

/** Cancel/delete are destructive — Super Admin only, per the Phase 5 permission table. */
export async function cancelVillaAction(villaId: string, reason: string): Promise<Villa> {
  await requireSuperAdmin();
  const villa = await (await getRepository()).cancelVilla(villaId, reason);
  revalidatePath("/projects");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
  revalidatePath("/collections");
  return villa;
}

export async function deleteVillaPermanentlyAction(villaId: string, reason: string): Promise<void> {
  await requireSuperAdmin();
  await (await getRepository()).deleteVillaPermanently(villaId, reason);
  revalidatePath("/projects");
  revalidatePath("/villas");
}
