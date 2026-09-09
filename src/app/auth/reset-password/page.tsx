"use client";

import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completePasswordResetAction } from "@/lib/auth/actions";

/**
 * Set a new password from an emailed reset link.
 *
 * Distinct from `/auth/change-password`, which demands the CURRENT password — a person
 * arriving here has forgotten it, so requiring it would dead-end the flow. The proof of
 * identity is the one-time link itself: `/auth/callback` has already exchanged its code
 * for a session by the time this page renders, and `completePasswordResetAction` calls
 * `requireUser()`, so an unauthenticated visitor cannot set anybody's password.
 *
 * Reaching this page directly without a valid link therefore fails on submit rather than
 * on load, which is deliberate: rendering the form either way reveals nothing about
 * whether a given link or account exists.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  /**
   * Supabase reports a bad link in the URL fragment before we ever see a session, so a
   * user who clicked an expired link lands here with nothing but an empty form. Reading it
   * lets the page say so and offer a way forward.
   */
  const linkError = useSyncExternalStore(
    () => () => {},
    () => {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = fragment.get("error_code") ?? fragment.get("error");
      if (!code) return "";
      return code === "otp_expired"
        ? "That reset link has expired or was already used."
        : "That reset link could not be used.";
    },
    () => "",
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      const result = await completePasswordResetAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Straight to the dashboard: the reset link already established a valid session, so
      // making someone sign in again with the password they just set is pure friction.
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-background p-0 md:p-9">
      <div className="mx-auto grid min-h-screen max-w-[116rem] place-items-center overflow-hidden bg-surface md:min-h-[calc(100vh-4.5rem)] md:rounded-lg md:shadow-[0_20px_70px_rgba(43,30,34,0.08)]">
        <div className="w-full max-w-[34rem] px-6 py-10 sm:px-10">
          <BrandMark />

          <div className="mt-12">
            <h1 className="font-display text-4xl font-semibold leading-tight">Set a new password</h1>
            <p className="mt-3 text-base text-muted-foreground">
              Choose a password of at least 12 characters that you have not used before.
            </p>
          </div>

          {linkError
            ? <div className="mt-10">
                <p className="rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{linkError}</p>
                <Button className="mt-6 h-14 w-full font-display text-xl" onClick={() => router.replace("/login")} size="lg" type="button">Request a new link</Button>
              </div>
            : <form className="mt-10 space-y-6" onSubmit={submit}>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="newPassword">New password</label>
                  <div className="relative">
                    <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input autoComplete="new-password" className="h-14 pl-12 pr-12 text-base" id="newPassword" minLength={12} name="newPassword" required type={show ? "text" : "password"} />
                    <button aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShow(!show)} type="button">
                      {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="confirmPassword">Confirm new password</label>
                  <div className="relative">
                    <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input autoComplete="new-password" className="h-14 pl-12 text-base" id="confirmPassword" minLength={12} name="confirmPassword" required type="password" />
                  </div>
                </div>

                {error && <p className="rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error}</p>}

                <Button className="h-14 w-full font-display text-xl" disabled={pending} size="lg" type="submit">
                  {pending ? "Saving..." : "Set password"}
                </Button>
              </form>}
        </div>
      </div>
    </main>
  );
}
