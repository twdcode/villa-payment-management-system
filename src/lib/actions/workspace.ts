"use server";

import { requireUser } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { MockDatabase, WorkspaceNotification } from "@/lib/domain/types";

/**
 * Refetches the whole workspace snapshot.
 *
 * Every page already gets this server-side on first load (`getRepository().getDatabase()`
 * in each `page.tsx`). This is the same call, reachable from a Client Component — for
 * refreshing after a mutation, or for the handful of pages that fetch on mount rather
 * than server-render (see `DEVELOPMENT-PHASES.md` Phase 4 for which ones and why).
 *
 * `getDatabase()` runs ~14 queries and is not cheap; call it after a save, not on a
 * timer or in a loop.
 */
export async function getWorkspaceDatabaseAction(): Promise<MockDatabase> {
  await requireUser();
  return (await getRepository()).getDatabase();
}

export async function getCurrentUserNotificationsAction(): Promise<WorkspaceNotification[]> {
  await requireUser();
  return (await getRepository()).getNotifications();
}
