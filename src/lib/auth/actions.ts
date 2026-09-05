"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/domain/types";
import { eq } from "drizzle-orm";

/**
 * The same message for a wrong password and an unknown address.
 *
 * Distinguishing them tells an attacker which emails are registered, which is the first
 * step in a credential-stuffing run.
 */
const INVALID_CREDENTIALS = "Incorrect email or password.";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((value) => !/^\s|\s$/.test(value), "Remove leading or trailing spaces.");

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function signInAction(formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID_CREDENTIALS };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, error: INVALID_CREDENTIALS };

  // A disabled user may still hold valid credentials. Check the row, then undo the sign-in.
  const [row] = await db.select().from(users).where(eq(users.authUserId, data.user.id)).limit(1);
  if (!row || row.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "This account has been disabled. Contact your administrator." };
  }

  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * The signed-in user, or null.
 *
 * `AppShell` needs this everywhere — the sidebar, notifications, permission-gated nav
 * items — and calls it from a `useEffect`, before a session is guaranteed to exist.
 * `getSessionUser()` reads the real session server-side; returning `null` here rather
 * than throwing keeps that timing safe.
 */
export async function getCurrentUserAction(): Promise<User | null> {
  return getSessionUser();
}

/**
 * Change your own password.
 *
 * The current password is required even though the session already proves identity: a
 * borrowed unlocked laptop should not be enough to lock the owner out of their account.
 */
export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = z
    .object({
      currentPassword: z.string().min(1, "Enter your current password."),
      newPassword: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: "The new passwords do not match.",
      path: ["confirmPassword"],
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      message: "Choose a password you have not used before.",
      path: ["newPassword"],
    })
    .safeParse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await createClient();

  // Re-authenticate. Supabase has no "verify password" call, so signing in again is how
  // the current password is proven.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { ok: false, error: "Your current password is incorrect." };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
    // Clears the forced-change redirect in middleware.
    data: {},
  });
  if (error) return { ok: false, error: error.message };

  await clearMustChangePassword(user.id);
  return { ok: true };
}

/**
 * Send a reset link.
 *
 * Always reports success. Saying "no such account" would turn this form into a way to
 * discover which addresses are registered.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback?next=/auth/change-password`,
  });
  return { ok: true };
}

/** Set a new password from an emailed reset link. The link is the proof of identity. */
export async function completePasswordResetAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = z
    .object({ newPassword: passwordSchema, confirmPassword: z.string() })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: "The new passwords do not match.",
      path: ["confirmPassword"],
    })
    .safeParse({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false, error: error.message };

  await clearMustChangePassword(user.id);
  return { ok: true };
}

/**
 * Drop the temporary-password flag.
 *
 * It lives in `app_metadata` so it reaches the JWT and the proxy can read it without a
 * database call — and, unlike `user_metadata`, users cannot write it themselves.
 */
async function clearMustChangePassword(userId: string): Promise<void> {
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return;

  await admin.auth.admin.updateUserById(row.authUserId, {
    app_metadata: { role: row.role, must_change_password: false },
  });
}
