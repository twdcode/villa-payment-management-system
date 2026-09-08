"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission, requireSuperAdmin, requireUser } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { Customer, PaymentSchedule, Villa } from "@/lib/domain/types";
import type { CustomerInput, DocumentLinkInput, DocumentLinkUpdate, PaymentScheduleUpdateInput, VillaDetailsUpdate, VillaInterestTermsInput, VillaSetupInput, VillaSetupResult } from "@/lib/repositories/contracts";

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

/**
 * How much charged interest a proposed grace period would remove, per stage.
 *
 * Read-only, so the dialog can warn before anything is written. Same permission as the
 * save it precedes — the figures describe a villa's money and are not for anyone who
 * could not change them anyway.
 */
export async function previewInterestWaiverAction(villaId: string, input: VillaInterestTermsInput): Promise<Array<{ scheduleId: string; stage: string; amount: number }>> {
  await requirePermission("manage_villas", { villaId });
  return (await getRepository()).previewInterestWaiver(villaId, input);
}

export async function updateVillaInterestTermsAction(villaId: string, input: VillaInterestTermsInput, waiverReason?: string): Promise<Villa> {
  await requirePermission("manage_villas", { villaId });
  const villa = await (await getRepository()).updateVillaInterestTerms(villaId, input, waiverReason);
  revalidatePath(`/projects`);
  return villa;
}

export async function addVillaDocumentAction(villaId: string, input: DocumentLinkInput): Promise<void> {
  await requirePermission("manage_documents", { villaId });
  await (await getRepository()).addVillaDocument(villaId, input);
  revalidatePath(`/projects`);
}

/**
 * Editing/removing a document is a step up from adding one — the PRD gives Staff only
 * "add notes and document links," while editing/managing them is an Editor+ right. Same
 * shape as `updateCollectionAction`: checked directly, not through `requirePermission`,
 * so the rule reads plainly here instead of hiding inside the permission matrix.
 */
export async function updateVillaDocumentAction(documentId: string, villaId: string, input: DocumentLinkUpdate): Promise<void> {
  const user = await requireUser();
  if (user.role !== "super_admin" && user.role !== "editor") {
    throw new AuthorizationError("Only a Super Admin or Editor can edit a document link.");
  }
  await (await getRepository()).updateVillaDocument(documentId, input);
  revalidatePath(`/projects/${villaId}`);
  revalidatePath("/projects");
}

export async function deleteVillaDocumentAction(documentId: string, villaId: string, reason: string): Promise<void> {
  const user = await requireUser();
  if (user.role !== "super_admin" && user.role !== "editor") {
    throw new AuthorizationError("Only a Super Admin or Editor can remove a document link.");
  }
  await (await getRepository()).deleteVillaDocument(documentId, reason);
  revalidatePath(`/projects/${villaId}`);
  revalidatePath("/projects");
}

export async function addVillaNoteAction(villaId: string, content: string): Promise<void> {
  await requirePermission("add_notes", { villaId });
  await (await getRepository()).addVillaNote(villaId, content);
  revalidatePath(`/projects`);
}

export async function updateVillaAction(villaId: string, input: VillaDetailsUpdate): Promise<Villa> {
  await requirePermission("manage_villas", { villaId });
  const villa = await (await getRepository()).updateVilla(villaId, input);
  revalidatePath(`/projects/${villa.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/villas");
  return villa;
}

export async function reassignVillaCustomerAction(villaId: string, input: { customerId?: string; newCustomer?: CustomerInput }): Promise<{ villa: Villa; customer: Customer | null }> {
  await requirePermission("manage_villas", { villaId });
  const result = await (await getRepository()).reassignVillaCustomer(villaId, input);
  revalidatePath(`/projects/${result.villa.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/villas");
  revalidatePath("/customers");
  return result;
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
