"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyOAuthError } from "@/lib/auth-errors";
import { Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "@binding/ui";
import type { SignupIntent } from "@/lib/signup-intent";

// Password auth is a demo/e2e-only shortcut — enabled via env in dev/e2e,
// explicitly "false" in deploy config (Vercel env). When off, continuing
// past the email step always sends a magic link, no password step exists.
const PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Step = "email" | "auth" | "sent";

export function LoginForm({
  intent,
  initialError = null,
}: {
  intent: SignupIntent | null;
  initialError?: string | null;
}) {
  const router = useRouter();
  const destination = intent ? `/onboarding?intent=${intent}` : "/";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const validEmail = EMAIL_RE.test(email);

  async function sendMagicLink() {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setStep("sent");
  }

  async function signInWithPassword() {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  function continueFromEmail() {
    if (!validEmail) return;
    if (PASSWORD_LOGIN_ENABLED) {
      setStep("auth");
    } else {
      void sendMagicLink();
    }
  }

  // Google is wired up (DESIGN.md §13h) — LinkedIn is still backlog, so its
  // button stays the inert stub until that provider is configured too.
  function onSocial() {
    toast("Social sign-in is coming soon", {
      description: "Continue with email for now.",
    });
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    // supabase-js's signInWithOAuth builds the /authorize URL client-side
    // and always resolves with error: null (see auth-errors.ts) — GoTrue
    // only discovers "provider not enabled" once the browser actually hits
    // /authorize, and by then it's a bare JSON error page instead of a
    // redirect back to this app. So we check GoTrue's public, side-effect-
    // free /auth/v1/settings first (this is the *only* extra request the
    // happy path avoids) and only start the real OAuth redirect when Google
    // is actually enabled — no new failure modes for a real sign-in.
    try {
      const settingsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`;
      const res = await fetch(settingsUrl, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      });
      const settings = res.ok ? await res.json().catch(() => null) : null;
      if (!settings?.external?.google) {
        setBusy(false);
        setError(friendlyOAuthError(new Error("provider is not enabled")));
        return;
      }
    } catch (checkError) {
      setBusy(false);
      setError(friendlyOAuthError(checkError));
      return;
    }

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    if (authError) {
      setBusy(false);
      setError(friendlyOAuthError(authError));
      return;
    }
    // On success the browser is already navigating to Google — nothing else to do.
  }

  return (
    <Card className="jb-fade w-full">
      {step === "email" && (
        <>
          <CardHeader>
            <CardTitle className="font-medium">Welcome back</CardTitle>
            <CardDescription>Sign in to see your job matches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={onGoogle}
                disabled={busy}
                data-testid="oauth-google"
              >
                Continue with Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={onSocial}
                data-testid="oauth-linkedin"
              >
                Continue with LinkedIn
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && continueFromEmail()}
              />
            </div>
            <Button className="w-full" onClick={continueFromEmail} disabled={busy || !validEmail}>
              Continue with email
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <p className="w-full text-center text-sm text-muted-foreground">
              New to Binding? <a href="/signup" data-testid="nav-signup">Create an account</a>
            </p>
          </CardFooter>
        </>
      )}

      {step === "auth" && (
        <>
          <CardHeader>
            <CardTitle className="font-medium">Enter your password</CardTitle>
            <CardDescription>{email}</CardDescription>
            <CardAction>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError(null);
                }}
              >
                Change
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-[13px] text-muted-foreground hover:underline"
                  onClick={sendMagicLink}
                >
                  Forgot?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && signInWithPassword()}
              />
            </div>
            <Button
              className="w-full"
              onClick={signInWithPassword}
              disabled={busy || !password}
            >
              Sign in
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={sendMagicLink} disabled={busy}>
              Email me a magic link
            </Button>
          </CardContent>
        </>
      )}

      {step === "sent" && (
        <>
          <CardHeader>
            <div className="mb-1.5 flex size-11 items-center justify-center rounded-full bg-accent text-xl text-accent-foreground">
              ✦
            </div>
            <CardTitle className="font-medium">Check your inbox</CardTitle>
            <CardDescription>
              We sent a one-tap sign-in link to {email}. It expires in 15 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" className="w-full" onClick={sendMagicLink} disabled={busy}>
              Resend link
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Use a different email
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </>
      )}
    </Card>
  );
}
