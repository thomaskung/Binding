"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SignupIntent } from "@/lib/signup-intent";

// Password auth is a demo/e2e-only shortcut — enabled via env in dev/e2e,
// explicitly "false" in deploy config (wrangler.jsonc). When off, /login is a
// plain magic-link form with no tab switcher at all.
const PASSWORD_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

export function LoginForm({ intent }: { intent: SignupIntent | null }) {
  const router = useRouter();
  const destination = intent ? `/onboarding?intent=${intent}` : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendMagicLink() {
    setBusy(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      },
    });
    setBusy(false);
    setStatus(error ? error.message : "Check your email for the sign-in link.");
  }

  async function signInWithPassword() {
    setBusy(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus(error.message);
    } else {
      router.push(destination);
      router.refresh();
    }
  }

  const emailField = (
    <div className="mb-4 space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        value={email}
        placeholder="you@example.com"
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in to JumpOnBoard</CardTitle>
        <CardDescription>Welcome back — we&apos;ll email you a secure link.</CardDescription>
      </CardHeader>
      <CardContent>
        {PASSWORD_LOGIN_ENABLED ? (
          <Tabs defaultValue="magic">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="magic" className="flex-1">Magic link</TabsTrigger>
              <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            </TabsList>
            {emailField}
            <TabsContent value="magic">
              <Button className="w-full" onClick={sendMagicLink} disabled={busy || !email}>
                Send magic link
              </Button>
            </TabsContent>
            <TabsContent value="password" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={signInWithPassword}
                disabled={busy || !email || !password}
              >
                Sign in
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {emailField}
            <Button className="w-full" onClick={sendMagicLink} disabled={busy || !email}>
              Send magic link
            </Button>
          </>
        )}
        {status && <p className="mt-4 text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  );
}
