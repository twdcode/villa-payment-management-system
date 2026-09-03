import { House } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkProps = { compact?: boolean; className?: string; inverted?: boolean };

export function BrandMark({ compact = false, className, inverted = false }: BrandMarkProps) {
  const textColor = inverted ? "text-sidebar-foreground" : "text-foreground";
  const subColor = inverted ? "text-sidebar-muted" : "text-accent";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {compact && (
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-accent bg-surface-muted text-accent">
          <House aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0">
        <p className={cn("font-display text-2xl font-semibold leading-none", textColor)}>Juniper</p>
        <p className={cn("mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em]", subColor)}>Villa Management</p>
      </div>
    </div>
  );
}
