import { VillaSetupPageClient } from "@/components/projects/villa-setup-page-client";
import { getRepository } from "@/lib/repositories";

export default async function VillaSetupPage({ params }: { params: Promise<{ projectId: string; villaId: string }> }) {
  const { projectId, villaId } = await params;
  const database = await (await getRepository()).getDatabase();
  return <VillaSetupPageClient database={database} projectId={projectId} villaId={villaId} />;
}
