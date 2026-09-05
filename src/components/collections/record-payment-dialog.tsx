"use client";

import { ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEMO_TODAY } from "@/lib/config/demo";
import type { Collection, Customer, MockDatabase, PaymentMethod, Villa } from "@/lib/domain/types";
import { recordCollectionAction, updateCollectionAction } from "@/lib/actions/collections";
import { calculateVillaFinancials } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { resolveInterestTerms } from "@/lib/domain/interest-terms";
import { isVillaActive } from "@/lib/domain/villa-status";
import { errorMessage } from "@/lib/errors";


/**
 * Reference is required only where one actually exists — a bank transfer or a cheque has
 * one; cash across a counter does not. The document link is optional throughout: both
 * columns are nullable in Postgres, and `CollectionInput` marks `receiptDocumentUrl`
 * optional, so requiring them here was a UI-layer rule stricter than the data model.
 */
const paymentSchema = z.object({
  paymentDate: z.string().min(1, "Select a payment date."),
  // Accepts "5440000", "5,440,000" or "5440000.50" — thousands separators are stripped so
  // a pasted or comma-typed figure is not silently rejected.
  amount: z.string()
    .transform((value) => Number(value.replace(/,/g, "").trim()))
    .refine((value) => Number.isFinite(value) && value > 0, "Enter a payment amount greater than zero."),
  paymentMethod: z.enum(["bank_transfer", "cash", "cheque", "card"]),
  referenceNumber: z.string().trim(),
  documentUrl: z.union([z.literal(""), z.url("Enter a valid document link.")]),
}).refine(
  (value) => value.paymentMethod === "cash" || value.paymentMethod === "card" || value.referenceNumber.length > 0,
  { message: "Enter the bank or cheque reference.", path: ["referenceNumber"] },
);

const villaName = (villa: Villa) => villa.number.replace(/^[A-Z]+-/, "Villa ");

/**
 * Records a payment, or corrects one when `editing` is supplied (C1 — there is no
 * reversal; a correction supersedes the original and keeps its receipt number).
 */
export function RecordPaymentDialog({ customer, database, editing, onClose, onSuccess, villa }: { customer?: Customer; database: MockDatabase; editing?: Collection; onClose: () => void; onSuccess: (message: string) => void; villa?: Villa }) {
  const eligibleVillas = database.villas.filter((candidate) => isVillaActive(candidate) && candidate.customerId && database.customers.some((item) => item.id === candidate.customerId) && database.schedules.some((schedule) => schedule.villaId === candidate.id));
  const [selectedVillaId, setSelectedVillaId] = useState(editing?.villaId ?? villa?.id ?? eligibleVillas[0]?.id ?? "");
  const selectedVilla = villa ?? eligibleVillas.find((candidate) => candidate.id === selectedVillaId);
  const selectedCustomer = customer ?? database.customers.find((candidate) => candidate.id === selectedVilla?.customerId);
  const schedules = selectedVilla ? database.schedules.filter((schedule) => schedule.villaId === selectedVilla.id) : [];
  const terms = resolveInterestTerms(database.settings, selectedVilla);
  const financials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
  const [form, setForm] = useState({
    paymentDate: editing?.paymentDate ?? DEMO_TODAY,
    amount: editing ? String(editing.totalAmount) : "",
    paymentMethod: editing?.paymentMethod ?? "bank_transfer",
    referenceNumber: editing?.referenceNumber ?? "",
    documentUrl: editing?.receiptDocumentUrl ?? "",
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /**
   * C2 — generated once when the form opens, not at submit.
   *
   * A double-click or a retried request then carries the SAME key, and the UNIQUE
   * constraint in Postgres returns the original receipt instead of issuing a second one.
   * Generating it at submit time would defeat the whole mechanism.
   */
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVilla || !selectedCustomer) {
      setError("Select a customer and villa.");
      return;
    }
    const parsed = paymentSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the payment details.");
      return;
    }
    if (editing && reason.trim().length < 3) {
      setError("Enter a reason for this correction.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        projectId: selectedVilla.projectId,
        villaId: selectedVilla.id,
        customerId: selectedCustomer.id,
        paymentDate: parsed.data.paymentDate,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod as PaymentMethod,
        referenceNumber: parsed.data.referenceNumber,
        ...(parsed.data.documentUrl ? { receiptDocumentUrl: parsed.data.documentUrl } : {}),
      };
      if (editing) {
        await updateCollectionAction(editing.id, payload, reason.trim());
        onSuccess("Collection corrected successfully.");
      } else {
        await recordCollectionAction({ ...payload, idempotencyKey });
        onSuccess("Payment recorded successfully.");
      }
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save payment."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><ReceiptText className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-2xl font-medium">{editing ? "Correct collection" : "Add collection"}</DialogTitle><DialogDescription className="mt-1">{editing ? `Receipt ${editing.receiptId ? "" : ""}will keep its original number. Interest is recalculated from the corrected values.` : "Oldest installment first, using the agreement's interest allocation rule."}</DialogDescription></div><Button aria-label="Close payment form" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><label className="mt-6 block text-sm font-semibold text-muted-foreground">Customer &amp; villa{customer && villa ? <input className="mt-2 h-12 w-full rounded-md border bg-surface-muted px-3 text-sm text-foreground" disabled value={`${customer.fullName} · ${villaName(villa)}`} /> : <select className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => { setSelectedVillaId(event.target.value); setError(""); }} required value={selectedVillaId}>{eligibleVillas.length ? eligibleVillas.map((candidate) => { const linkedCustomer = database.customers.find((item) => item.id === candidate.customerId); return <option key={candidate.id} value={candidate.id}>{linkedCustomer?.fullName} · {villaName(candidate)}</option>; }) : <option value="">No eligible customer and villa</option>}</select>}</label><dl className="mt-5 grid gap-3 rounded-lg bg-surface-subtle p-4 sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Principal balance</dt><dd className="mt-1 font-semibold">{formatLkr(financials.outstandingPrincipal)}</dd></div><div><dt className="text-xs text-muted-foreground">Interest due</dt><dd className="mt-1 font-semibold text-danger">{formatLkr(financials.interestOutstanding)}</dd></div><div><dt className="text-xs text-muted-foreground">Total payable</dt><dd className="mt-1 font-semibold">{formatLkr(financials.outstandingPrincipal + financials.interestOutstanding)}</dd></div><div><dt className="text-xs text-muted-foreground">Allocation order</dt><dd className="mt-1 font-semibold">{terms.allocationOrder === "interest_first" ? "Interest first" : "Principal first"}</dd></div></dl><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Payment date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} type="date" value={form.paymentDate} /></label><label className="text-sm font-semibold text-muted-foreground">Amount received<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" inputMode="decimal" onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="e.g. 5,440,000" type="text" value={form.amount} /></label><label className="text-sm font-semibold text-muted-foreground">Payment method<select className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })} value={form.paymentMethod}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="card">Card</option></select></label><label className="text-sm font-semibold text-muted-foreground">Reference number{(form.paymentMethod === "cash" || form.paymentMethod === "card") && <span className="ml-1 font-normal normal-case text-muted-foreground">(optional)</span>}<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} placeholder={form.paymentMethod === "cash" || form.paymentMethod === "card" ? "Not required for this method" : "Bank / cheque reference"} value={form.referenceNumber} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document link<span className="ml-1 font-normal normal-case text-muted-foreground">(optional)</span><input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, documentUrl: event.target.value })} placeholder="https://drive.google.com/..." type="url" value={form.documentUrl} /></label>{editing && <label className="mt-4 block text-sm font-semibold text-muted-foreground">Reason for correction<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setReason(event.target.value)} placeholder="Why is this being corrected?" value={reason} /></label>}{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving || !selectedVilla || !selectedCustomer} type="submit">{saving ? "Saving..." : editing ? "Save correction" : "Save payment"}</Button></footer></form></DialogContent></Dialog>;
}
