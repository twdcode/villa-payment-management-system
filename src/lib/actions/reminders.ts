"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSuperAdmin } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { ReminderApproval } from "@/lib/domain/types";
import type { ReminderApprovalInput, ReminderApprovalReviewInput } from "@/lib/repositories/contracts";

/**
 * Queue a reminder for every schedule trigger crossed but not yet queued.
 *
 * Runs when the Super Admin opens the approval queue, not on a schedule. The function is
 * idempotent and compares dates with `>=`, so opening the tab catches up on everything
 * missed since it was last opened — a nightly job bought nothing, because a queued row
 * does nothing until somebody looks at this exact table.
 *
 * Super Admin only, matching who can see the queue: gating it any wider meant Staff and
 * Editors triggering a full scan for a table they can never open.
 */
export async function queueDueRemindersAction(): Promise<{ queued: number; skippedNoTemplate: number }> {
  await requireSuperAdmin();
  const result = await (await getRepository()).queueDueReminders();
  if (result.queued > 0) revalidatePath("/collections");
  return result;
}

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
