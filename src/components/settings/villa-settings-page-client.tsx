"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MockDatabase, Villa } from "@/lib/domain/types";
import { getRepository } from "@/lib/repositories";

const repository = getRepository();

type Action = "cancel" | "delete" | null;

function VillaActionDialog({ action, onClose, onComplete, villa }: { action: Exclude<Action, null>; onClose: () => void; onComplete: () => void; villa: Villa }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isCancellation = action === "cancel";
  const title = isCancellation ? `Cancel Villa ${villa.number} programme?` : `Permanently delete Villa ${villa.number}?`;
  const actionLabel = isCancellation ? "Cancel villa programme" : "Delete permanently";
  const reasonLabel = isCancellation ? "Reason for cancellation" : "Reason for deletion";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (isCancellation) await repository.cancelVilla(villa.id, reason);
      else await repository.deleteVillaPermanently(villa.id, reason);
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${isCancellation ? "cancel" : "delete"} this villa.`);
    } finally {
      setSaving(false);
    }
  }

  return <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-lg p-5 sm:w-[calc(100%-2rem)] sm:p-7" showClose={false}>
      <form onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><span className={`grid size-11 place-items-center rounded-md ${isCancellation ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger"}`}>{isCancellation ? <AlertTriangle className="size-5" /> : <Trash2 className="size-5" />}</span><DialogTitle className="mt-5 text-xl font-medium sm:text-2xl">{title}</DialogTitle><DialogDescription className="mt-2 text-sm text-muted-foreground">{isCancellation ? "This disables future financial activity but keeps the villa and its complete history available." : "This removes the villa and its non-financial records. This action cannot be undone."}</DialogDescription></div><Button aria-label="Close confirmation" className="shrink-0" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-5" /></Button></div>
        <section className="mt-6 rounded-lg border bg-surface-subtle p-4 text-sm text-muted-foreground"><div className="flex items-center gap-3"><CheckCircle2 className="size-5 shrink-0 text-success" /><span>{isCancellation ? "Receipts and payment history remain available" : "Only villas without financial history can be deleted"}</span></div><div className="mt-3 flex items-center gap-3"><CheckCircle2 className="size-5 shrink-0 text-success" /><span>{isCancellation ? "Documents and notes remain available" : "A deletion reason is retained in the action audit"}</span></div><div className="mt-3 flex items-center gap-3"><AlertTriangle className="size-5 shrink-0 text-warning" /><span>{isCancellation ? "New collections and reminders will stop" : "Deleted villas cannot be restored"}</span></div></section>
        <label className="mt-6 block text-sm font-semibold text-muted-foreground">{reasonLabel}<textarea className="mt-2 min-h-28 w-full resize-y rounded-md border bg-surface px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setReason(event.target.value)} placeholder={isCancellation ? "Explain why this villa programme is being cancelled..." : "Explain why this villa must be permanently deleted..."} value={reason} /></label><p className="mt-2 text-sm text-muted-foreground">This reason will be visible in the villa audit history.</p>
        {error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
        <footer className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end"><Button onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={reason.trim().length < 3 || saving} type="submit" variant={isCancellation ? "outline" : "destructive"}>{saving ? "Saving..." : actionLabel}</Button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}

export function VillaSettingsPageClient() {
  const [database, setDatabase] = useState<MockDatabase | null>(null);
  const [selectedVillaId, setSelectedVillaId] = useState("");
  const [action, setAction] = useState<Action>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const next = await repository.getDatabase();
      setDatabase(next);
      setSelectedVillaId((current) => current && next.villas.some((villa) => villa.id === current) ? current : next.villas[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load villa settings.");
    }
  }

  useEffect(() => {
    let active = true;
    void repository.getDatabase().then((next) => {
      if (!active) return;
      setDatabase(next);
      setSelectedVillaId(next.villas[0]?.id ?? "");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load villa settings.");
    });
    return () => { active = false; };
  }, []);

  const villa = useMemo(() => database?.villas.find((candidate) => candidate.id === selectedVillaId) ?? null, [database, selectedVillaId]);
  const hasFinancialHistory = Boolean(villa && database?.collections.some((collection) => collection.villaId === villa.id));

  function completed(nextAction: Exclude<Action, null>) {
    setAction(null);
    setFeedback(nextAction === "cancel" ? "Villa programme cancelled successfully." : "Villa permanently deleted successfully.");
    void refresh();
  }

  return <AppShell active="Settings"><div className="max-w-5xl"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">Super Admin</p><h1 className="mt-3 text-3xl font-semibold">Villa settings</h1><p className="mt-2 text-base text-muted-foreground">Control this villa programme and preserve its financial history.</p>
    {feedback && <div className="fixed right-4 top-4 z-40 flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-lg border border-success bg-success px-4 py-4 text-sm font-medium text-primary-foreground shadow-lg" role="status"><span className="flex items-center gap-3"><Info className="size-5" />{feedback}</span><button aria-label="Dismiss success message" className="rounded-md p-1 hover:bg-primary-foreground/15" onClick={() => setFeedback("")}><X className="size-4" /></button></div>}
    {error ? <p className="mt-6 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p> : !database ? <div className="mt-8 h-64 animate-pulse rounded-lg border bg-surface-muted" /> : <><label className="mt-8 block max-w-md text-sm font-semibold text-muted-foreground">Villa programme<select className="mt-2 h-11 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSelectedVillaId(event.target.value)} value={selectedVillaId}>{database.villas.map((candidate) => <option key={candidate.id} value={candidate.id}>Villa {candidate.number} · {database.projects.find((project) => project.id === candidate.projectId)?.name}</option>)}</select></label>
      {villa && <><section className="mt-7 rounded-lg border bg-surface p-6"><div className="flex items-center gap-4"><span className="grid size-12 place-items-center rounded-md bg-surface-muted"><ShieldAlert className="size-6 text-primary" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current programme</p><h2 className="mt-1 text-xl font-semibold">Villa {villa.number}</h2><p className="mt-1 text-sm text-muted-foreground">{villa.operationalStatus === "cancelled" ? "Cancelled" : "Active"} {villa.cancellationReason ? `· ${villa.cancellationReason}` : "· Collections, schedules, notes and documents are managed from the villa profile."}</p></div></div></section>
        <section className="mt-5 rounded-lg border border-warning/40 bg-surface p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">Programme control</p><h2 className="mt-3 text-xl font-semibold">Cancel villa programme</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use cancellation when an agreement should stop accepting new financial activity while its receipts, documents, notes, and audit history remain available.</p><Button className="mt-5" disabled={villa.operationalStatus === "cancelled"} onClick={() => setAction("cancel")} variant="outline">Cancel villa programme</Button></section>
        <section className="mt-5 rounded-lg border border-danger/40 bg-surface p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">Danger zone</p><h2 className="mt-3 text-xl font-semibold">Permanently delete villa</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Permanent deletion is intended only for duplicate or mistakenly created villas. This action cannot be undone.</p>{hasFinancialHistory && <p className="mt-4 flex items-center gap-2 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger"><AlertTriangle className="size-5 shrink-0" />Unavailable because this villa has financial history. Cancel the programme instead to preserve records.</p>}<Button className="mt-5" disabled={hasFinancialHistory} onClick={() => setAction("delete")} variant="destructive">Delete permanently</Button></section></>}
    </>}
    {villa && action && <VillaActionDialog action={action} key={`${villa.id}-${action}`} onClose={() => setAction(null)} onComplete={() => completed(action)} villa={villa} />}
  </div></AppShell>;
}
