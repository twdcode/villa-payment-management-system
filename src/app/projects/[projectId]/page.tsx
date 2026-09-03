import { ProjectVillasPageClient } from "@/components/projects/project-villas-page-client";

export default async function ProjectVillasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectVillasPageClient projectId={projectId} />;
}
