import { ProjectVillasPageClient } from "@/components/projects/project-villas-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function ProjectVillasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <ProjectVillasPageClient initialData={initialData} projectId={projectId} />;
}
