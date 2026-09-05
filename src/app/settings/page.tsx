import { WorkspaceSettingsPageClient } from "@/components/settings/workspace-settings-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function SettingsPage() {
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <WorkspaceSettingsPageClient initialData={initialData} />;
}
