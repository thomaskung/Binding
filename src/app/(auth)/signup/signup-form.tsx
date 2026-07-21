"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@jumponboard/ui";
import { RoleChooserCards } from "@/components/role-chooser-cards";
import type { SignupIntent } from "@/lib/signup-intent";

/** Magic-link-only signup. No password option — that's a demo/e2e shortcut
 * that lives (env-gated) on /login, not in a real account-creation flow.
 * With no valid intent, a role chooser shows first; picking updates the URL
 * (refresh-safe, same shape the landing CTAs produce). */
export function SignupForm({ intent }: { intent: SignupIntent | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!intent) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create your JumpOnBoard account</CardTitle>
          <CardDescription>
            What brings you here? You can add the other role any time later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleChooserCards onPick={(role) => router.replace(`/signup?intent=${role}`)} />
        </CardContent>
      </Card>
    );
  }

  async function sendMagicLink() {
    setBusy(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const destination = `/onboarding?intent=${intent}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    setBusy(false);
    setStatus(error ? error.message : "Check your email for a secure sign-in link.");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create your JumpOnBoard account</CardTitle>
        <CardDescription>
          {intent === "seeker"
            ? "Join the talent pool — pseudonymous until you say otherwise."
            : "Start hiring matched, high-intent candidates."}{" "}
          We&apos;ll email a secure sign-in link — no password to set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            data-testid="signup-email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          data-testid="signup-submit"
          onClick={sendMagicLink}
          disabled={busy || !email}
        >
          Create account
        </Button>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}
