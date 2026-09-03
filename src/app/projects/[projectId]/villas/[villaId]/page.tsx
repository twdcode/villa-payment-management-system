import { VillaProfilePageClient } from "@/components/projects/villa-profile-page-client";

export default async function VillaProfilePage({ params }: { params: Promise<{ projectId: string; villaId: string }> }) {
  const { projectId, villaId } = await params;
  return <VillaProfilePageClient projectId={projectId} villaId={villaId} />;
}
