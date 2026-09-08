"use client";

import * as PopperPrimitive from "@radix-ui/react-popper";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { createPortal } from "react-dom";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A row action menu: a trigger button and a floating list of actions.
 *
 * Built on Radix's low-level `Popper` + `DismissableLayer` — the same primitives
 * `dialog.tsx` builds on — rather than a hand-rolled `absolute` `<div>`. That fixes two
 * real bugs the hand-rolled version had:
 *
 *  1. `position: absolute` inside a `overflow-x-auto` table with a `sticky` Action column
 *     clipped the menu against the column's own background, which is the "white
 *     foreground" artefact — the menu was rendering, just behind or cut off by the
 *     sticky cell next to it. `Popper` renders through a portal at the document root and
 *     positions with `fixed`, so it can never be clipped by an ancestor's overflow or
 *     painted over by a sticky sibling.
 *  2. There was no outside-click or Escape handling, so a menu stayed open until its own
 *     trigger was clicked again — opening a second row's menu just stacked another one on
 *     top. `DismissableLayer` closes on an outside pointerdown or Escape, and each menu is
 *     its own layer, so opening one closes any other that was still open.
 */
export function ActionMenu({ children, label, trigger }: { children: React.ReactNode; label: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <PopperPrimitive.Root>
      <PopperPrimitive.Anchor asChild>
        <button aria-expanded={open} aria-haspopup="menu" aria-label={label} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { setAnchor(event.currentTarget); setOpen((current) => !current); }} type="button">
          {trigger}
        </button>
      </PopperPrimitive.Anchor>
      {open && anchor && createPortal(
        <PopperPrimitive.Content align="end" className="z-50" side="bottom" sideOffset={6}>
          <DismissableLayer onDismiss={() => setOpen(false)} onEscapeKeyDown={() => setOpen(false)} onFocusOutside={() => setOpen(false)} onPointerDownOutside={() => setOpen(false)}>
            <div className={cn("w-56 rounded-lg border bg-surface p-2 shadow-xl")} onClick={() => setOpen(false)} role="menu">
              {children}
            </div>
          </DismissableLayer>
        </PopperPrimitive.Content>,
        document.body,
      )}
    </PopperPrimitive.Root>
  );
}
