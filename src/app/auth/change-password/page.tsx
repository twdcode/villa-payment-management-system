"use client";

import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState, useTransition } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordAction } from "@/lib/auth/actions";

/**
 * Change your own password.
 *
 * Reached two ways: from Settings by choice, or forced by the proxy while a temporary
 * password is still in use. Styling follows the login page — same field heights, same
 * icon treatment — so it reads as part of the same product.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      const result = await changePasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
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
            <h1 className="font-display text-4xl font-semibold leading-tight">Change your password</h1>
            <p className="mt-3 text-base text-muted-foreground">
              Choose a password of at least 12 characters that you have not used before.
            </p>
          </div>

          <form className="mt-10 space-y-6" onSubmit={submit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="currentPassword">Current password</label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input autoComplete="current-password" className="h-14 pl-12 text-base" id="currentPassword" name="currentPassword" required type="password" />
              </div>
            </div>

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
            {done && <p className="rounded-md bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">Password updated.</p>}

            <Button className="h-14 w-full font-display text-xl" disabled={pending} size="lg" type="submit">
              {pending ? "Saving..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
