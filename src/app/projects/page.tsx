import { ProjectsPageClient } from "@/components/projects/projects-page-client";
import { getRepository } from "@/lib/repositories";

export default async function ProjectsPage() {
  const repository = await getRepository();
  const [database, currentUser] = await Promise.all([repository.getDatabase(), repository.getCurrentUser()]);
  return <ProjectsPageClient database={database} currentUser={currentUser} />;
}
