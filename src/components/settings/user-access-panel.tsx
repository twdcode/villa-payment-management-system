"use client";

import { AlertTriangle, Eye, EyeOff, Pencil, Plus, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User, UserRole } from "@/lib/domain/types";
import { roleLabels } from "@/lib/permissions/roles";
import { createUserAction, updateUserAction, deleteUserAction, listUsersAction, setUserActiveAction } from "@/lib/actions/users";
import { errorMessage } from "@/lib/errors";
import { useCurrentUser } from "@/components/auth/current-user-provider";


const roleValues = ["super_admin", "editor", "staff", "view_only"] as const;

const userAccessSchema = z.object({
  name: z.string().trim().min(2, "Full name must contain at least two characters."),
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(roleValues),
  temporaryPassword: z.string(),
});

type UserAccessForm = z.infer<typeof userAccessSchema>;

const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

function PanelHeading({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-2xl font-medium">User access</h2>
        <p className="mt-2 text-sm text-muted-foreground">Only Super Admins can add people, change roles, disable access or remove users</p>
      </div>
      <Button className="self-start" onClick={onAdd}><Plus className="size-4" />Add user</Button>
    </header>
  );
}

function UserFormDialog({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: (user: User, message: string) => void }) {
  const isEditing = Boolean(user);
  const [form, setForm] = useState<UserAccessForm>({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? "staff", temporaryPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => userAccessSchema.safeParse(form), [form]);
  // Only account creation sets a password. Editing an existing user cannot change their
  // credential — that happens through the reset link they request themselves.
  const passwordIsValid = isEditing || form.temporaryPassword.length >= 8;
  const canSubmit = parsed.success && passwordIsValid;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = userAccessSchema.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the user details.");
      return;
    }
    if (!isEditing && result.data.temporaryPassword.length < 8) {
      setError("Temporary password must contain at least 8 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = user
        ? await updateUserAction(user.id, result.data)
        : await createUserAction(result.data);
      onSaved(saved, user ? "User profile updated successfully." : "User access added successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to save user access."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto p-5 sm:p-8">
        <span className="grid size-12 place-items-center rounded-md bg-surface-muted"><UserRoundPlus className="size-6" /></span>
        <div>
          <DialogTitle className="text-2xl font-medium">{isEditing ? "Edit user access" : "Add user access"}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {isEditing ? "Update this person's name, email address or role." : "Create an account with email, temporary password and role."}
          </DialogDescription>
        </div>
        <form onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold text-muted-foreground">Full name<Input autoFocus className="mt-2" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Nadeesha Perera" value={form.name} /></label>
            <label className="text-sm font-semibold text-muted-foreground">Email address<Input autoComplete="email" className="mt-2" onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.lk" type="email" value={form.email} /></label>
          </div>
          <label className="mt-5 block text-sm font-semibold text-muted-foreground">Role<Select onValueChange={(next) => setForm({ ...form, role: next as UserRole })} value={form.role}><SelectTrigger className="mt-2 h-11"><SelectValue /></SelectTrigger><SelectContent>{roleValues.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectContent></Select></label>
          {isEditing
            ? <p className="mt-5 flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />Passwords cannot be set from here. If this person is locked out, ask them to use &ldquo;Forgot password&rdquo; on the sign-in page — the reset link goes to their inbox, so no one else ever handles their password.</p>
            : <label className="mt-5 block text-sm font-semibold text-muted-foreground">Temporary password<span className="relative mt-2 block"><Input autoComplete="new-password" className="pr-12" onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} placeholder="Minimum 8 characters" type={showPassword ? "text" : "password"} value={form.temporaryPassword} /><Tooltip><TooltipTrigger asChild><button aria-label={showPassword ? "Hide temporary password" : "Show temporary password"} className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground" onClick={() => setShowPassword((visible) => !visible)} type="button">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></TooltipTrigger><TooltipContent>{showPassword ? "Hide password" : "Show password"}</TooltipContent></Tooltip></span></label>}
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><span className="mt-0.5 text-success">●</span>Passwords stay masked after saving. Share the temporary password securely with the user.</p>
          {error && <p className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button disabled={!canSubmit || saving} type="submit">{saving ? "Saving..." : isEditing ? "Update user" : "Save user"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await deleteUserAction(user.id);
      onDeleted(user.id);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to delete this user."));
      setDeleting(false);
    }
  }
  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open>
      <DialogContent className="max-w-xl text-center" showClose={false}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger/10 text-danger"><AlertTriangle className="size-7" /></span>
        <div><DialogTitle className="text-2xl font-medium">Delete {user.name}?</DialogTitle><DialogDescription className="mt-3 text-sm text-muted-foreground">This removes the user from Settings. This action cannot be undone.</DialogDescription></div>
        {error && <p className="rounded-md bg-danger/10 px-4 py-3 text-left text-sm font-medium text-danger" role="alert">{error}</p>}
        <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row"><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button disabled={deleting} onClick={() => void remove()} variant="destructive">{deleting ? "Deleting..." : "Delete"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The staff directory is fetched here, through `listUsersAction`, rather than arriving in
 * the page's `database` prop. That prop is serialised into the page HTML, so carrying
 * emails, roles and account status in it published the whole directory to every signed-in
 * user of every role. This action requires `manage_users`.
 */
export function UserAccessPanel({ onNotify }: { onNotify: (message: string) => void }) {
  const currentUser = useCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; user: User } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const activeUsers = users.filter((user) => user.isActive);
  const superAdmins = activeUsers.filter((user) => user.role === "super_admin");

  useEffect(() => {
    let cancelled = false;
    void listUsersAction()
      .then((rows) => { if (!cancelled) setUsers(rows); })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, "Unable to load users.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function saveUser(user: User, message: string) {
    setUsers((current) => current.some((candidate) => candidate.id === user.id)
      ? current.map((candidate) => candidate.id === user.id ? user : candidate)
      : [...current, user]);
    setEditor(null);
    onNotify(message);
  }

  async function changeStatus(user: User) {
    setBusyId(user.id);
    setError("");
    try {
      const updated = await setUserActiveAction(user.id, !user.isActive);
      setUsers((current) => current.map((candidate) => candidate.id === user.id ? updated : candidate));
      onNotify(updated.isActive ? "User enabled successfully." : "User disabled successfully.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to change user access."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <section className="min-w-0 rounded-lg border bg-surface p-5 sm:p-7">
        <PanelHeading onAdd={() => setEditor({ mode: "create" })} />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">{[[activeUsers.length, "Active users"], [superAdmins.length, "Super admins"], [users.length - activeUsers.length, "Disabled"]].map(([value, label]) => <div className="rounded-md bg-surface-muted p-4" key={String(label)}><p className="text-2xl font-semibold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{label}</p></div>)}</div>
        {error && <p className="mt-5 rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}
        {loading && <p className="mt-5 text-sm text-muted-foreground">Loading users...</p>}
        <div className="mt-5 divide-y">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUser?.id;
            return <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center" key={user.id}>
              <div className={`flex min-w-0 flex-1 items-center gap-3 ${user.isActive ? "" : "opacity-45"}`}><span className="grid size-12 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-bold">{initials(user.name)}</span><div className="min-w-0"><p className="truncate font-semibold">{user.name}{isCurrentUser && <span className="ml-2 rounded-full bg-surface-muted px-2 py-1 text-xs">You</span>}</p><p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p></div></div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user.isActive ? "bg-sky-100 text-sky-700" : "bg-surface-muted text-muted-foreground opacity-60"}`}>{roleLabels[user.role]}</span>
                <span className={`min-w-16 text-xs font-semibold ${user.isActive ? "text-success" : "text-muted-foreground"}`}>● {user.isActive ? "Active" : "Disabled"}</span>
                <Tooltip><TooltipTrigger asChild><span><Button aria-label={`Delete ${user.name}`} disabled={isCurrentUser || busyId === user.id} onClick={() => setDeleteTarget(user)} size="icon" variant="ghost"><Trash2 className="size-4 text-danger" /></Button></span></TooltipTrigger><TooltipContent>{isCurrentUser ? "You cannot delete your own account." : `Delete ${user.name}`}</TooltipContent></Tooltip>
                {user.isActive ? <Button disabled={isCurrentUser || busyId === user.id} onClick={() => void changeStatus(user)} size="sm" variant="ghost">Disable</Button> : <Tooltip><TooltipTrigger asChild><Button disabled={busyId === user.id} onClick={() => void changeStatus(user)} size="sm" variant="ghost">Enable</Button></TooltipTrigger><TooltipContent>Click &quot;Enable&quot; to activate this user.</TooltipContent></Tooltip>}
                <Button disabled={busyId === user.id} onClick={() => setEditor({ mode: "edit", user })} size="sm" variant="outline">Edit <Pencil className="size-4" /></Button>
              </div>
            </div>;
          })}
        </div>
      </section>
      {editor && <UserFormDialog key={editor.mode === "edit" ? editor.user.id : "new-user"} onClose={() => setEditor(null)} onSaved={saveUser} user={editor.mode === "edit" ? editor.user : null} />}
      {deleteTarget && <DeleteUserDialog onClose={() => setDeleteTarget(null)} onDeleted={(id) => { setDeleteTarget(null); setUsers((current) => current.filter((user) => user.id !== id)); onNotify("User deleted successfully."); }} user={deleteTarget} />}
    </TooltipProvider>
  );
}
