"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSuperAdmin } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { ReminderApproval } from "@/lib/domain/types";
import type { ReminderApprovalInput, ReminderApprovalReviewInput } from "@/lib/repositories/contracts";

export async function createReminderApprovalAction(input: ReminderApprovalInput): Promise<ReminderApproval> {
  await requirePermission("send_reminders", { villaId: input.villaId });
  const approval = await (await getRepository()).createReminderApproval(input);
  revalidatePath("/collections");
  return approval;
}

/**
 * Approve, draft, or send a reminder. Super Admin only — matching the existing
 * "Manual approval required" gate in the Collections UI, so a review call site cannot
 * bypass what the tab visibility already implies.
 */
export async function reviewReminderApprovalAction(id: string, input: ReminderApprovalReviewInput): Promise<ReminderApproval> {
  await requireSuperAdmin();
  const approval = await (await getRepository()).reviewReminderApproval(id, input);
  revalidatePath("/collections");
  return approval;
}
