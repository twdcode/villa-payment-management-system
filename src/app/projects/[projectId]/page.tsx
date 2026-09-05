import { ProjectVillasPageClient } from "@/components/projects/project-villas-page-client";
import { getRepository } from "@/lib/repositories";

export default async function ProjectVillasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const database = await (await getRepository()).getDatabase();
  return <ProjectVillasPageClient database={database} projectId={projectId} />;
}
