import { ProjectsPageClient } from "@/components/projects/projects-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function ProjectsPage() {
  if (getDataSource() !== "supabase") return <ProjectsPageClient />;
  const repository = await getRepository();
  const [database, currentUser] = await Promise.all([repository.getDatabase(), repository.getCurrentUser()]);
  return <ProjectsPageClient initialData={{ database, currentUser }} />;
}
