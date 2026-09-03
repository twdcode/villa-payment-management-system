import { Check, Mail, Plus } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const swatches = [
  ["Primary", "bg-primary", "#2B1E22"],
  ["Accent", "bg-accent", "#C4AAB1"],
  ["Soft accent", "bg-surface-muted", "#F0E8EA"],
  ["Background", "bg-background", "#F8F6F6"],
  ["Success", "bg-success", "#2F8068"],
  ["Warning", "bg-warning", "#B67A2E"],
  ["Danger", "bg-danger", "#B64555"],
];

export default function StyleGuidePage() {
  return (
    <AppShell active="Settings">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Foundation</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Style guide</h1>
          <p className="mt-2 text-muted-foreground">Shared visual language for Juniper Villa Management.</p>
        </div>

        <section className="border-b pb-10">
          <h2 className="text-lg font-semibold">Colors</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {swatches.map(([name, color, value]) => (
              <div key={name}>
                <div className={`h-20 rounded-md border ${color}`} />
                <p className="mt-3 text-sm font-semibold">{name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b pb-10">
          <h2 className="text-lg font-semibold">Typography</h2>
          <div className="mt-5 space-y-5">
            <p className="font-display text-4xl font-semibold">Villa financial management</p>
            <p className="text-2xl font-semibold">Section heading</p>
            <p className="text-base text-muted-foreground">Clear, considered interface copy for internal daily work.</p>
            <p className="text-sm text-muted-foreground">Supporting labels, table details, and timestamps.</p>
          </div>
        </section>

        <section className="border-b pb-10">
          <h2 className="text-lg font-semibold">Actions</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button><Plus className="size-4" />Add villa</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Reverse collection</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <section className="grid gap-8 border-b pb-10 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Form controls</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold" htmlFor="sample-email">Email address</label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-11" id="sample-email" placeholder="name@company.com" type="email" />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox />Remember me</label>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Status</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-success"><Check className="size-4" />Paid</span>
              <span className="rounded-full bg-surface-muted px-3 py-1.5 text-sm font-semibold text-foreground">Scheduled</span>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-warning">Due soon</span>
              <span className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-danger">Overdue</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
