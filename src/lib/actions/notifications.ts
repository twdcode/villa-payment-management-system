"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { WorkspaceNotification } from "@/lib/domain/types";

export async function markNotificationReadAction(id: string): Promise<WorkspaceNotification> {
  await requireUser();
  const notification = await (await getRepository()).markNotificationRead(id);
  revalidatePath("/dashboard");
  return notification;
}

export async function markAllNotificationsReadAction(): Promise<WorkspaceNotification[]> {
  await requireUser();
  const notifications = await (await getRepository()).markAllNotificationsRead();
  revalidatePath("/dashboard");
  return notifications;
}
