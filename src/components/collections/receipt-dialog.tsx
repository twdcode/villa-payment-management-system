"use client";

import { Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Collection, Customer, MockDatabase, Project, Receipt, Villa } from "@/lib/domain/types";
import { formatLkr } from "@/lib/formatters";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-LK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));

/**
 * A printable receipt for one confirmed collection.
 *
 * Printing goes through the browser's own dialog (`window.print()`), where every browser
 * offers "Save as PDF" as a destination — that is the PDF export, with no library, no
 * server route to secure, and no second rendering of the money to keep in sync. The
 * `data-printable` / `data-print-hide` attributes drive the `@media print` block in
 * `globals.css`, which hides the app chrome so only the receipt reaches the page.
 *
 * The amounts are read from `database.receipts` (the `v_receipts` view), never
 * recomputed here. A receipt is a record of what was allocated at the time, so
 * recalculating it in the client could print a number that disagrees with the ledger.
 */
export function ReceiptDialog({ collection, customer, database, onClose, project, receipt, villa }: { collection: Collection; customer: Customer; database: MockDatabase; onClose: () => void; project: Project; receipt: Receipt; villa: Villa }) {
  const villaName = villa.number.replace(/^[A-Z]+-/, "Villa ");
  const settings = database.settings;

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" data-printable showClose={false}>
    <div className="flex items-start justify-between gap-4" data-print-hide>
      <div>
        <DialogTitle className="text-2xl font-medium">Receipt {receipt.number}</DialogTitle>
        <DialogDescription className="mt-1">{customer.fullName} · {villaName}</DialogDescription>
      </div>
      <Button aria-label="Close receipt" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button>
    </div>

    {/* The printed document. The @media print block in globals.css strips the dialog framing. */}
    <article className="mt-6 rounded-lg border bg-surface p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-lg font-semibold">{settings.companyName}</p>
          <p className="mt-1 text-sm text-muted-foreground">Official payment receipt</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Receipt no.</p>
          <p className="mt-1 font-semibold">{receipt.number}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(receipt.issuedAt)}</p>
        </div>
      </header>

      <section className="grid gap-5 border-b py-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Received from</p>
          <p className="mt-2 font-medium">{customer.fullName}</p>
          {customer.email && <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>}
          {customer.phone && <p className="mt-1 text-sm text-muted-foreground">{customer.phone}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Property</p>
          <p className="mt-2 font-medium">{villaName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
          {project.location && <p className="mt-1 text-sm text-muted-foreground">{project.location}</p>}
        </div>
      </section>

      <section className="grid gap-5 border-b py-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Payment date</p>
          <p className="mt-2 font-medium">{formatDate(collection.paymentDate)}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Method</p>
          <p className="mt-2 font-medium capitalize">{collection.paymentMethod.replace("_", " ")}</p>
          {collection.referenceNumber && <p className="mt-1 text-sm text-muted-foreground">Ref: {collection.referenceNumber}</p>}
        </div>
      </section>

      {/* Principal and interest shown separately — a PRD requirement, and the thing a
          customer disputing a balance actually needs to see. */}
      <section className="py-5">
        <table className="w-full text-left text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-3">Principal</td>
              <td className="py-3 text-right font-semibold">{formatLkr(receipt.principalAmount)}</td>
            </tr>
            <tr className="border-b">
              <td className="py-3">Interest</td>
              <td className="py-3 text-right font-semibold">{formatLkr(receipt.interestAmount)}</td>
            </tr>
            <tr>
              <td className="py-4 text-base font-semibold">Total received</td>
              <td className="py-4 text-right text-base font-semibold">{formatLkr(receipt.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="border-t pt-5 text-xs text-muted-foreground">
        <p>This is a computer-generated receipt issued by {settings.companyName}. Amounts are in {settings.currency}.</p>
      </footer>
    </article>

    <footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end" data-print-hide>
      <Button onClick={onClose} type="button" variant="outline">Close</Button>
      <Button onClick={() => window.print()} type="button"><Printer className="size-4" />Print / Save as PDF</Button>
    </footer>
  </DialogContent></Dialog>;
}
