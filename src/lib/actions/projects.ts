"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { Project } from "@/lib/domain/types";
import type { ProjectInput, ProjectUpdate } from "@/lib/repositories/contracts";

export async function createProjectAction(input: ProjectInput): Promise<Project> {
  await requirePermission("manage_projects");
  const project = await (await getRepository()).createProject(input);
  revalidatePath("/projects");
  return project;
}

export async function updateProjectAction(id: string, input: ProjectUpdate): Promise<Project> {
  await requirePermission("manage_projects", { projectId: id });
  const project = await (await getRepository()).updateProject(id, input);
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return project;
}
