import { WorkspaceSettingsPageClient } from "@/components/settings/workspace-settings-page-client";
import { getRepository } from "@/lib/repositories";

export default async function SettingsPage() {
  const database = await (await getRepository()).getDatabase();
  return <WorkspaceSettingsPageClient database={database} />;
}
