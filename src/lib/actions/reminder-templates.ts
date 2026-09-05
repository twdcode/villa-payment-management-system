"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSuperAdmin } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { ReminderTemplate } from "@/lib/domain/types";
import type { ReminderTemplateInput } from "@/lib/repositories/contracts";

export async function createReminderTemplateAction(input: ReminderTemplateInput): Promise<ReminderTemplate> {
  await requirePermission("send_reminders");
  const template = await (await getRepository()).createReminderTemplate(input);
  revalidatePath("/settings");
  return template;
}

export async function updateReminderTemplateAction(id: string, input: ReminderTemplateInput): Promise<ReminderTemplate> {
  await requirePermission("send_reminders");
  const template = await (await getRepository()).updateReminderTemplate(id, input);
  revalidatePath("/settings");
  return template;
}

export async function setReminderTemplateActiveAction(id: string, isActive: boolean): Promise<ReminderTemplate> {
  await requirePermission("send_reminders");
  const template = await (await getRepository()).setReminderTemplateActive(id, isActive);
  revalidatePath("/settings");
  return template;
}

/** Deletion is destructive — Super Admin only, per the Phase 5 permission table. */
export async function deleteReminderTemplateAction(id: string): Promise<void> {
  await requireSuperAdmin();
  await (await getRepository()).deleteReminderTemplate(id);
  revalidatePath("/settings");
}
