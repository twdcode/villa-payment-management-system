import { VillaProfilePageClient } from "@/components/projects/villa-profile-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function VillaProfilePage({ params }: { params: Promise<{ projectId: string; villaId: string }> }) {
  const { projectId, villaId } = await params;
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <VillaProfilePageClient initialData={initialData} projectId={projectId} villaId={villaId} />;
}
