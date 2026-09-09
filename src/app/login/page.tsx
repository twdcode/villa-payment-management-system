"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction, signInAction } from "@/lib/auth/actions";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  /**
   * Explain why the user landed back here.
   *
   * An expired or already-used reset link redirects to `/login` carrying the reason, and
   * without this the page rendered a blank form — the user is told nothing, tries the old
   * link again, and gets the same silence.
   *
   * `useSyncExternalStore` rather than an effect: the reason lives in the URL, which is an
   * external source, and reading it this way gives the server an empty string and the
   * client the real value without a state write. Supabase's own failures arrive in the URL
   * FRAGMENT rather than the query string, so both are checked.
   */
  const linkError = useSyncExternalStore(
    () => () => {},
    () => {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = query.get("error_code") ?? fragment.get("error_code") ?? query.get("error") ?? fragment.get("error");
      if (!code) return "";
      return code === "link_expired" || code === "otp_expired"
        ? "That reset link has expired or was already used. Request a new one below."
        : "That link could not be used. Request a new one below.";
    },
    () => "",
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await signInAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The proxy decides where to land — dashboard, or the forced password change.
      router.replace(new URLSearchParams(window.location.search).get("next") ?? "/dashboard");
      router.refresh();
    });
  }

  function forgotPassword() {
    const email = (document.getElementById("email") as HTMLInputElement | null)?.value ?? "";
    if (!email.trim()) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", email);
      const result = await requestPasswordResetAction(formData);
      // Deliberately the same message whether or not the address exists.
      setNotice(result.ok ? "If that email is registered, a reset link is on its way." : "");
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <main className="min-h-screen bg-background p-0 md:p-9">
      <div className="mx-auto grid min-h-screen max-w-[116rem] overflow-hidden bg-surface md:min-h-[calc(100vh-4.5rem)] md:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] md:rounded-lg md:shadow-[0_20px_70px_rgba(43,30,34,0.08)]">
        <section className="order-2 flex min-w-0 items-center px-6 py-10 sm:px-10 md:order-1 md:px-[clamp(3rem,7vw,9rem)] md:py-14">
          <div className="w-full max-w-[34rem]">
            <BrandMark compact className="md:hidden" />
            <BrandMark className="hidden md:flex" />

            <div className="mt-12 md:mt-18">
              <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Welcome back</h1>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">Sign in to access your villa sales and payment dashboard.</p>
            </div>

            <form className="mt-10 space-y-6" onSubmit={submit}>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="email">Email address</label>
                <div className="relative">
                  <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input autoComplete="email" id="email" name="email" placeholder="Enter your email" required className="h-14 pl-12 text-base" type="email" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="password">Password</label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input autoComplete="current-password" id="password" name="password" placeholder="Enter your password" required className="h-14 pl-12 pr-12 text-base" type={showPassword ? "text" : "password"} />
                  <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowPassword(!showPassword)} type="button">
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 text-muted-foreground"><Checkbox defaultChecked name="remember" />Keep me signed in</label>
                <button className="font-semibold text-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={forgotPassword} type="button">Forgot password?</button>
              </div>

              {(error || linkError) && <p className="rounded-md bg-danger/10 px-4 py-3 text-sm font-medium text-danger" role="alert">{error || linkError}</p>}
              {notice && <p className="rounded-md bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{notice}</p>}

              <Button className="h-14 w-full font-display text-xl" disabled={pending} size="lg" type="submit">{pending ? "Signing in..." : "Sign in"}</Button>
            </form>

            <div className="mt-12 hidden rounded-md bg-surface-muted p-5 md:flex md:items-center md:gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent/25 text-accent"><ShieldCheck className="size-6" /></span>
              <div>
                <p className="font-semibold">Secure &amp; private</p>
                <p className="mt-1 text-sm text-muted-foreground">Your data is protected with enterprise-grade security.</p>
              </div>
            </div>
            <p className="mt-9 text-xs text-muted-foreground">&copy; 2026 Juniper Villa Management</p>
          </div>
        </section>

        <section className="relative order-1 min-h-72 overflow-hidden md:order-2 md:min-h-0">
          <Image alt="Contemporary villa at sunset" className="object-cover object-[70%_center]" fill priority sizes="(max-width: 767px) 100vw, 50vw" src="/images/juniper-villa-login.png" />
          <div aria-hidden="true" className="absolute inset-0 bg-primary/10" />
        </section>
      </div>
    </main>
  );
}
