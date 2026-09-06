import { redirect } from "next/navigation";

import { WorkspaceSettingsPageClient } from "@/components/settings/workspace-settings-page-client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";
import { getRepository } from "@/lib/repositories";

/**
 * Settings is Super Admin only.
 *
 * The guard is here, on the server, before anything is fetched or rendered. Hiding the
 * sidebar link is not access control: without this check, typing `/settings` into the
 * address bar as any role rendered the whole page, including the user access table.
 *
 * It redirects rather than 404s so a mistyped URL lands somewhere useful. Server actions
 * behind this page re-check the permission themselves — this stops the page being *read*,
 * `requirePermission` stops it being *used*.
 */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user || !can(user.role, "view_settings")) redirect("/dashboard");

  const database = await (await getRepository()).getDatabase();
  return <WorkspaceSettingsPageClient database={database} />;
}
