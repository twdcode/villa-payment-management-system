"use client";

import { ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DEMO_TODAY } from "@/lib/config/demo";
import type { Customer, MockDatabase, PaymentMethod, Villa } from "@/lib/domain/types";
import { calculateVillaFinancials } from "@/lib/finance/calculations";
import { formatLkr } from "@/lib/formatters";
import { mockRepository } from "@/lib/repositories/local-storage-repository";

const paymentSchema = z.object({
  paymentDate: z.string().min(1, "Select a payment date."),
  amount: z.coerce.number().positive("Enter a payment amount greater than zero."),
  paymentMethod: z.enum(["bank_transfer", "cash", "cheque", "card"]),
  referenceNumber: z.string().trim().min(1, "Enter a bank or cheque reference."),
  documentUrl: z.url("Enter a valid document link."),
});

const villaName = (villa: Villa) => villa.number.replace(/^[A-Z]+-/, "Villa ");

export function RecordPaymentDialog({ customer, database, onClose, onSuccess, villa }: { customer?: Customer; database: MockDatabase; onClose: () => void; onSuccess: (message: string) => void; villa?: Villa }) {
  const eligibleVillas = database.villas.filter((candidate) => candidate.operationalStatus !== "cancelled" && candidate.customerId && database.customers.some((item) => item.id === candidate.customerId) && database.schedules.some((schedule) => schedule.villaId === candidate.id));
  const [selectedVillaId, setSelectedVillaId] = useState(villa?.id ?? eligibleVillas[0]?.id ?? "");
  const selectedVilla = villa ?? eligibleVillas.find((candidate) => candidate.id === selectedVillaId);
  const selectedCustomer = customer ?? database.customers.find((candidate) => candidate.id === selectedVilla?.customerId);
  const schedules = selectedVilla ? database.schedules.filter((schedule) => schedule.villaId === selectedVilla.id) : [];
  const storedTerms = { ...database.settings.defaultInterestTerms, ...selectedVilla?.interestTerms };
  const terms = selectedVilla?.chargeLatePaymentInterest === false ? { ...storedTerms, monthlyRate: 0 } : storedTerms;
  const financials = calculateVillaFinancials(schedules, terms, DEMO_TODAY);
  const [form, setForm] = useState({ paymentDate: DEMO_TODAY, amount: "", paymentMethod: "bank_transfer", referenceNumber: "", documentUrl: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setError("");
    try {
      await mockRepository.recordCollection({
        projectId: selectedVilla.projectId,
        villaId: selectedVilla.id,
        customerId: selectedCustomer.id,
        paymentDate: parsed.data.paymentDate,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod as PaymentMethod,
        referenceNumber: parsed.data.referenceNumber,
        receiptDocumentUrl: parsed.data.documentUrl,
      });
      onSuccess("Payment recorded successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save payment.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => !open && onClose()} open><DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}><form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className="grid size-11 place-items-center rounded-md bg-surface-muted"><ReceiptText className="size-5 text-primary" /></span><DialogTitle className="mt-4 text-2xl font-medium">Add collection</DialogTitle><DialogDescription className="mt-1">Oldest installment first, using the agreement&apos;s interest allocation rule.</DialogDescription></div><Button aria-label="Close payment form" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div><label className="mt-6 block text-sm font-semibold text-muted-foreground">Customer &amp; villa{customer && villa ? <input className="mt-2 h-12 w-full rounded-md border bg-surface-muted px-3 text-sm text-foreground" disabled value={`${customer.fullName} · ${villaName(villa)}`} /> : <select className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => { setSelectedVillaId(event.target.value); setError(""); }} required value={selectedVillaId}>{eligibleVillas.length ? eligibleVillas.map((candidate) => { const linkedCustomer = database.customers.find((item) => item.id === candidate.customerId); return <option key={candidate.id} value={candidate.id}>{linkedCustomer?.fullName} · {villaName(candidate)}</option>; }) : <option value="">No eligible customer and villa</option>}</select>}</label><dl className="mt-5 grid gap-3 rounded-lg bg-surface-subtle p-4 sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Principal balance</dt><dd className="mt-1 font-semibold">{formatLkr(financials.outstandingPrincipal)}</dd></div><div><dt className="text-xs text-muted-foreground">Interest due</dt><dd className="mt-1 font-semibold text-danger">{formatLkr(financials.interestOutstanding)}</dd></div><div><dt className="text-xs text-muted-foreground">Total payable</dt><dd className="mt-1 font-semibold">{formatLkr(financials.outstandingPrincipal + financials.interestOutstanding)}</dd></div><div><dt className="text-xs text-muted-foreground">Allocation order</dt><dd className="mt-1 font-semibold">{terms.allocationOrder === "interest_first" ? "Interest first" : "Principal first"}</dd></div></dl><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-muted-foreground">Payment date<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} type="date" value={form.paymentDate} /></label><label className="text-sm font-semibold text-muted-foreground">Amount received<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" min="0.01" onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" type="number" value={form.amount} /></label><label className="text-sm font-semibold text-muted-foreground">Payment method<select className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} value={form.paymentMethod}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="card">Card</option></select></label><label className="text-sm font-semibold text-muted-foreground">Reference number<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })} placeholder="Bank / cheque reference" value={form.referenceNumber} /></label></div><label className="mt-4 block text-sm font-semibold text-muted-foreground">Document link<input className="mt-2 h-12 w-full rounded-md border bg-surface px-3 text-sm" onChange={(event) => setForm({ ...form, documentUrl: event.target.value })} placeholder="https://drive.google.com/..." type="url" value={form.documentUrl} /></label>{error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving || !selectedVilla || !selectedCustomer} type="submit">{saving ? "Saving..." : "Save payment"}</Button></footer></form></DialogContent></Dialog>;
}
