import { AppShell } from "@/components/layout/app-shell";

type WorkspaceHeadingProps = { title: string };

export function WorkspaceHeading({ title }: WorkspaceHeadingProps) {
  return (
    <AppShell active={title}>
      <div className="max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Juniper Villa Management</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">{title}</h1>
      </div>
    </AppShell>
  );
}
