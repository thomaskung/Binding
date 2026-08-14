import Link from "next/link";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { computeSecurityHealthFlags } from "@/lib/security-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAgentTokens } from "../../agent-token-actions";
import { isResumeEncryptionEnabled } from "../../key-custody-actions";
import { AgentTokenCard } from "../agent-token-card";
import { PasskeyKeyCustodyCard } from "../passkey-key-custody-card";

/** /seeker/settings/security (DESIGN.md §13e base + §14j deepening, Phase 6;
 * §2g Phase 10 fills the passkey/recovery-code placeholder with a real
 * enrollment flow — see PasskeyKeyCustodyCard; §14e Phase 11 fills the
 * agent/API-token placeholder — see AgentTokenCard). Account deletion stays
 * at /account (unchanged, tested nightly as functional test #15) — this
 * page links to it rather than relocating the flow. */
export default async function SeekerSecuritySettingsPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [encryptionEnabled, agentTokens, { data: consent }] = await Promise.all([
    isResumeEncryptionEnabled(),
    listAgentTokens(),
    supabase.from("consent_flags").select("agent_access_opt_in_at").eq("profile_id", session.userId).maybeSingle(),
  ]);
  const agentAccessOptedIn = consent?.agent_access_opt_in_at != null;

  const linkedProviders = (user?.identities ?? []).map((i) => i.provider);
  const flags = computeSecurityHealthFlags({
    now: new Date(),
    accountCreatedAt: user?.created_at ? new Date(user.created_at) : new Date(),
    linkedProviders: linkedProviders.length > 0 ? linkedProviders : ["email"],
    emailConfirmedAt: user?.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
  });

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Security settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign-in methods and account security.{" "}
          <Link href="/seeker/settings/privacy" className="underline">
            Privacy settings
          </Link>
        </p>
      </header>

      {flags.length > 0 && (
        <section
          data-testid="security-health-panel"
          className="space-y-2 rounded-lg border border-border bg-muted/40 p-4"
        >
          <h2 className="text-sm font-semibold">Security command centre</h2>
          <ul className="space-y-1.5">
            {flags.map((flag) => (
              <li key={flag.id} data-testid={`security-flag-${flag.id}`} className="text-sm">
                <Badge variant={flag.severity === "warning" ? "destructive" : "secondary"} className="mr-2">
                  {flag.severity}
                </Badge>
                {flag.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">Sign-in methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <p className="text-sm">
            Signed in via:{" "}
            {linkedProviders.length > 0 ? linkedProviders.join(", ") : "email (magic link)"}
          </p>
          <p className="text-xs text-muted-foreground">
            Email: {user?.email} —{" "}
            {user?.email_confirmed_at ? "verified" : "not verified"}
          </p>
        </CardContent>
      </Card>

      <PasskeyKeyCustodyCard displayName={session.displayName} initiallyEnrolled={encryptionEnabled} />

      <AgentTokenCard agentAccessOptedIn={agentAccessOptedIn} initialTokens={agentTokens} />

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">Account deletion</CardTitle>
          <CardDescription>
            Deleting your account is permanent. Manage it from your{" "}
            <Link href="/account" className="underline">
              Account page
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
