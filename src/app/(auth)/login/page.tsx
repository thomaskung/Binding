"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const router = useRouter();
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
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    setStatus(error ? error.message : "Check your email for the sign-in link.");
  }

  // Password login exists for local demo/seed accounts (see README for demo
  // credentials) and e2e tests. Production flow is magic-link-first.
  async function signInWithPassword() {
    setBusy(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to JumpOnBoard</CardTitle>
          <CardDescription>Magic link, or password for demo accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="magic">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="magic" className="flex-1">Magic link</TabsTrigger>
              <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            </TabsList>
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
          {status && <p className="mt-4 text-sm text-muted-foreground">{status}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
