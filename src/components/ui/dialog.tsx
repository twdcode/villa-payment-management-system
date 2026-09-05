"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean };

function DialogContent({ className, children, showClose = true, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      {/* `data-print-hide`: the wash would print as a grey page. See @media print in globals.css. */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-primary/35 backdrop-blur-[1px]" data-print-hide />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-lg border bg-surface p-6 shadow-xl focus:outline-none sm:p-7", className)}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger };
