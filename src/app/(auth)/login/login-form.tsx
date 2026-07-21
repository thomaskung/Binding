"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label } from "@jumponboard/ui";
import type { SignupIntent } from "@/lib/signup-intent";

// Password auth is a demo/e2e-only shortcut — enabled via env in dev/e2e,
// explicitly "false" in deploy config (wrangler.jsonc). When off, continuing
// past the email step always sends a magic link, no password step exists.
const PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Step = "email" | "auth" | "sent";

export function LoginForm({ intent }: { intent: SignupIntent | null }) {
  const router = useRouter();
  const destination = intent ? `/onboarding?intent=${intent}` : "/";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  // No OAuth provider is wired up yet (config.toml has every auth.external
  // provider disabled) — tracked as backlog. Buttons are visible but inert
  // rather than silently doing nothing.
  function onSocial() {
    toast("Social sign-in is coming soon", {
      description: "Continue with email for now.",
    });
  }

  return (
    <Card className="w-full max-w-md">
      {step === "email" && (
        <>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to see your job matches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={onSocial}>
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full" onClick={onSocial}>
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
              New to JumpOnBoard? <a href="/signup">Create an account</a>
            </p>
          </CardFooter>
        </>
      )}

      {step === "auth" && (
        <>
          <CardHeader>
            <CardTitle>Enter your password</CardTitle>
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
              <Label htmlFor="password">Password</Label>
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
            <CardTitle>Check your inbox</CardTitle>
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
