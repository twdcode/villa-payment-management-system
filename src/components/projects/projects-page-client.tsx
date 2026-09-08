"use client";

import { Building2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import type { MockDatabase, Project, ProjectStatus, User } from "@/lib/domain/types";
import { projectStatusLabels } from "@/lib/domain/status-labels";
import { formatLkrCompact } from "@/lib/formatters";
import { can } from "@/lib/permissions/roles";
import { deriveProjectSummaries, type ProjectSummary } from "@/lib/projects/project-summary";
import { createProjectAction, updateProjectAction } from "@/lib/actions/projects";
import { errorMessage } from "@/lib/errors";
import { villaLabel } from "@/lib/domain/villa-label";


type ProjectFormValues = { name: string; location: string; plannedVillaCount: string; status: ProjectStatus };

const statusStyles: Record<ProjectStatus, string> = {
  active: "bg-success/10 text-success",
  completed: "bg-success/10 text-success",
};

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[status]}`}>{projectStatusLabels[status]}</span>;
}

function ProjectCard({ project, editable, onEdit }: { project: ProjectSummary; editable: boolean; onEdit: (project: Project) => void }) {
  const isCompleted = project.project.status === "completed";
  const previewVillas = project.villas.slice(0, 4);

  return (
    <article className={`project-card group relative flex min-h-94 flex-col rounded-xl border bg-surface p-6 ${isCompleted ? "project-card--completed bg-success/5" : "hover:bg-surface"}`}>
      <Link aria-label={`Open ${project.project.name} villas`} className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/projects/${project.project.id}`} />
      <div className="flex items-start justify-between gap-4">
        <span className={`grid size-12 place-items-center rounded-xl ${isCompleted ? "bg-success/15" : "bg-surface-muted"}`}><Building2 aria-hidden="true" className="size-5 text-primary" strokeWidth={1.8} /></span>
        <div className="flex items-center gap-2">
          <ProjectStatusBadge status={project.project.status} />
          {editable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label={`Edit ${project.project.name}`} className="relative z-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" onClick={() => onEdit(project.project)} size="icon" variant="ghost"><Pencil className="size-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Edit project</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-medium">{project.project.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{project.project.location} <span aria-hidden="true">·</span> {project.villaCount} villas</p>
      </div>

      <div aria-label={`${project.allocationProgress}% collection progress`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={project.allocationProgress} className="mt-7 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar"><div className="h-full bg-accent transition-[width]" style={{ width: `${project.allocationProgress}%` }} /></div>

      <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
        <div><dt className="text-muted-foreground">Value</dt><dd className="mt-1.5 text-lg font-semibold">{formatLkrCompact(project.totalValue)}</dd></div>
        <div><dt className="text-muted-foreground">Collected</dt><dd className="mt-1.5 text-lg font-semibold">{formatLkrCompact(project.principalCollected)}</dd></div>
        <div><dt className="text-muted-foreground">Available</dt><dd className="mt-1.5 text-lg font-semibold">{project.availableVillaCount}</dd></div>
      </dl>

      <div className="mt-6 border-t pt-4">
        {previewVillas.length > 0 ? <ul className="flex flex-wrap gap-2">{previewVillas.map((villa) => <li className="rounded-md border bg-surface px-3 py-2 text-xs font-medium" key={villa.id}>{villaLabel(villa.number)}</li>)}</ul> : <p className="text-sm text-muted-foreground">Villa inventory will be added next.</p>}
      </div>
    </article>
  );
}

function ProjectFormDialog({ onOpenChange, onSaved, open, project }: { onOpenChange: (open: boolean) => void; onSaved: (project: Project, message: string) => void; open: boolean; project: Project | null }) {
  const [values, setValues] = useState<ProjectFormValues>(() => ({ name: project?.name ?? "", location: project?.location ?? "", plannedVillaCount: project?.plannedVillaCount?.toString() ?? "", status: project?.status ?? "active" }));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = project !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const savedProject = isEditing
        ? await updateProjectAction(project.id, { name: values.name, location: values.location, status: values.status })
        : await createProjectAction({ name: values.name, location: values.location, status: "active", plannedVillaCount: Number(values.plannedVillaCount) });
      onSaved(savedProject, isEditing ? "Project updated successfully." : "Project created successfully.");
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save the project."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl rounded-2xl px-6 py-10 sm:px-9" showClose={false}>
        <div>
          <DialogTitle className="text-2xl font-medium">{isEditing ? "Edit project" : "Create project"}</DialogTitle>
          <DialogDescription className="mt-2 text-base text-muted-foreground">{isEditing ? "Update the project information below." : "Complete the required information below."}</DialogDescription>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground" htmlFor="project-name">Project name</label><Input className="h-15" id="project-name" onChange={(event) => setValues({ ...values, name: event.target.value })} required value={values.name} /></div>
          <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground" htmlFor="project-location">Location</label><Input className="h-15" id="project-location" onChange={(event) => setValues({ ...values, location: event.target.value })} required value={values.location} /></div>
          {isEditing ? <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground" htmlFor="project-status">Project status</label><Select onValueChange={(next) => setValues({ ...values, status: next as ProjectStatus })} value={values.status}><SelectTrigger className="h-15" id="project-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Complete</SelectItem></SelectContent></Select></div> : <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground" htmlFor="planned-villa-count">Number of villas</label><Input className="h-15" id="planned-villa-count" min="1" onChange={(event) => setValues({ ...values, plannedVillaCount: event.target.value })} required type="number" value={values.plannedVillaCount} /></div>}
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
          <div className="flex justify-end pt-2"><Button disabled={isSaving} size="lg" type="submit">{isSaving ? "Saving..." : isEditing ? "Save changes" : "Create project"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPageClient({ database, currentUser }: { database: MockDatabase; currentUser: User }) {
  return (
    <AppShell active="Projects & Villas">
      <ProjectsPageBody currentUser={currentUser} database={database} />
    </AppShell>
  );
}

/**
 * Split from `ProjectsPageClient` so `useToast()` resolves: the provider is mounted by
 * `AppShell`, and JSX written inside `<AppShell>...</AppShell>` is built during the
 * parent's own render, before that provider exists. Same rule as `useCurrentUser` —
 * see ARCHITECTURE.md, "The client/server boundary."
 */
function ProjectsPageBody({ database, currentUser }: { database: MockDatabase; currentUser: User }) {
  const [projects, setProjects] = useState<ProjectSummary[]>(() => deriveProjectSummaries(database));
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { toast } = useToast();

  const visibleProjects = useMemo(() => projects.filter((summary) => summary.project.status === status), [projects, status]);
  const canManageProjects = can(currentUser.role, "manage_projects");

  function handleSaved(project: Project, message: string) {
    setProjects((current) => {
      const index = current.findIndex((summary) => summary.project.id === project.id);
      if (index === -1) return [{ project, villas: [], villaCount: project.plannedVillaCount ?? 0, totalValue: 0, principalCollected: 0, outstandingPrincipal: 0, availableVillaCount: 0, allocationProgress: 0 }, ...current];
      return current.map((summary) => summary.project.id === project.id ? { ...summary, project } : summary);
    });
    toast(message);
  }

  return (
    <>
      <div className="max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><h1 className="font-display text-3xl font-semibold">Projects &amp; Villa</h1><p className="mt-2 text-base text-muted-foreground">Manage developments and their villa inventory.</p></div>{canManageProjects && <Button className="w-full border-accent bg-surface text-foreground shadow-none hover:bg-surface-muted sm:w-auto" onClick={() => { setEditingProject(null); setDialogOpen(true); }} size="lg" variant="outline">Add Project <Plus className="size-5" /></Button>}</div>
        <div aria-label="Project status filter" className="mt-9 flex items-center gap-4" role="tablist">{(["active", "completed"] as const).map((tab) => <button aria-selected={status === tab} className={`h-12 rounded-xl border px-5 text-sm font-semibold transition-colors ${status === tab ? "bg-surface-muted text-foreground" : "bg-surface text-muted-foreground hover:bg-surface-muted"}`} key={tab} onClick={() => setStatus(tab)} role="tab" type="button">{tab === "active" ? "Active" : "Complete"}</button>)}</div>
        {visibleProjects.length === 0 ? <div className="mt-9 grid min-h-80 place-items-center rounded-xl border border-dashed bg-surface-subtle px-6 text-center"><div><Building2 aria-hidden="true" className="mx-auto size-8 text-accent" /><h2 className="mt-4 text-lg font-semibold">No {status === "active" ? "active" : "completed"} projects</h2><p className="mt-2 text-sm text-muted-foreground">Projects with this status will appear here.</p></div></div> : <section className="mt-9 grid gap-6 md:grid-cols-2 xl:grid-cols-3" role="tabpanel">{visibleProjects.map((project) => <ProjectCard editable={canManageProjects} key={project.project.id} onEdit={(selectedProject) => { setEditingProject(selectedProject); setDialogOpen(true); }} project={project} />)}</section>}
      </div>
      <ProjectFormDialog key={`${dialogOpen}-${editingProject?.id ?? "new"}`} onOpenChange={setDialogOpen} onSaved={handleSaved} open={dialogOpen} project={editingProject} />
    </>
  );
}
