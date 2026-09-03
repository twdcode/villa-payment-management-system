import { VillaSetupPageClient } from "@/components/projects/villa-setup-page-client";

export default async function VillaSetupPage({ params }: { params: Promise<{ projectId: string; villaId: string }> }) {
  const { projectId, villaId } = await params;
  return <VillaSetupPageClient projectId={projectId} villaId={villaId} />;
}
