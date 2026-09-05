import { VillaProfilePageClient } from "@/components/projects/villa-profile-page-client";
import { getRepository } from "@/lib/repositories";

export default async function VillaProfilePage({ params }: { params: Promise<{ projectId: string; villaId: string }> }) {
  const { projectId, villaId } = await params;
  const database = await (await getRepository()).getDatabase();
  return <VillaProfilePageClient database={database} projectId={projectId} villaId={villaId} />;
}
