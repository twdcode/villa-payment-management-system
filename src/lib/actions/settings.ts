"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSuperAdmin } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { WorkspaceSettings } from "@/lib/domain/types";
import type { ApplicationSettingsInput, GracePeriodInput, InterestDefaultsInput, PaymentScheduleDefaultsInput } from "@/lib/repositories/contracts";

/** Only `super_admin` holds `manage_settings` — see `lib/permissions/roles.ts`. */
export async function createGracePeriodAction(input: GracePeriodInput): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).createGracePeriod(input);
  revalidatePath("/settings");
  return settings;
}

export async function updateGracePeriodAction(id: string, input: GracePeriodInput): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).updateGracePeriod(id, input);
  revalidatePath("/settings");
  return settings;
}

export async function setGracePeriodActiveAction(id: string, isActive: boolean): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).setGracePeriodActive(id, isActive);
  revalidatePath("/settings");
  return settings;
}

/** Deletion is destructive — Super Admin only, per the Phase 5 permission table. */
export async function deleteGracePeriodAction(id: string): Promise<WorkspaceSettings> {
  await requireSuperAdmin();
  const settings = await (await getRepository()).deleteGracePeriod(id);
  revalidatePath("/settings");
  return settings;
}

export async function updateApplicationSettingsAction(input: ApplicationSettingsInput): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).updateApplicationSettings(input);
  revalidatePath("/settings");
  return settings;
}

export async function updateInterestDefaultsAction(input: InterestDefaultsInput): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).updateInterestDefaults(input);
  revalidatePath("/settings");
  return settings;
}

export async function updateProjectPaymentScheduleDefaultsAction(input: PaymentScheduleDefaultsInput): Promise<WorkspaceSettings> {
  await requirePermission("manage_settings");
  const settings = await (await getRepository()).updateProjectPaymentScheduleDefaults(input);
  revalidatePath("/settings");
  return settings;
}
