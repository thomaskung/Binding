import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrCreateInviteCode } from "@/lib/referrals";
import { earnReferralActivation, REFERRAL_REWARD_POINTS } from "@/lib/points";
import { InviteLinkCard } from "./invite-link-card";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  signed_up: "Signed up",
  activated: "Activated",
};
const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default"> = {
  pending: "outline",
  signed_up: "secondary",
  activated: "default",
};

interface ReferralRow {
  id: string;
  referee_id: string | null;
  status: string;
  created_at: string;
  activated_at: string | null;
}

/**
 * Referral / invite dashboard (DESIGN.md §13g). Role-agnostic — works
 * identically for a seeker-only, recruiter-only, or dual-role account,
 * since the invite mechanic doesn't care which role the referee eventually
 * activates. `requireRole` isn't used for exactly that reason; any
 * onboarded session may view their own referrals.
 *
 * Deliberately NOT added to `SEEKER_NAV`/`RECRUITER_NAV` (both fixed,
 * deliberate lists per CLAUDE.md) — surfaced instead via a small dashboard
 * card on `/seeker` and `/recruiter` linking here, the safer default for a
 * route that isn't one of the core nav destinations.
 */
export default async function InvitePage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.onboarded) redirect("/onboarding");

  const admin = createSupabaseAdminClient();
  const code = await getOrCreateInviteCode(admin, session.userId);

  // Built server-side from request headers (not `location.origin` — that's
  // client-only, and computing it client-side here would re-render the
  // input with a different value after hydration, a mismatch). Vercel sets
  // `x-forwarded-host`/`x-forwarded-proto`; `host` is the plain-Node fallback
  // for local dev, where there's no proxy in front of the app.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const inviteLink = `${proto}://${host}/invite/${code}`;

  const { data: initialRows } = await admin
    .from("referrals")
    .select("id, referee_id, status, created_at, activated_at")
    .eq("referrer_id", session.userId)
    .order("created_at", { ascending: false });
  const initial = (initialRows ?? []) as ReferralRow[];

  // Opportunistic retry: a referral stuck at 'signed_up' past the referrer's
  // daily cap (src/lib/points.ts earnReferralActivation) has no automatic
  // retry job in this phase — re-attempting on every dashboard load is the
  // practical path back to 'activated' once the cap clears. Cheap no-op when
  // still capped or already paid (idempotent on the referrer-leg ledger note).
  const retryable = initial.filter((r) => r.status !== "activated" && r.referee_id);
  for (const r of retryable) {
    await earnReferralActivation(admin, r.id, session.userId, r.referee_id as string).catch(
      () => {},
    );
  }

  const { data: finalRows } = retryable.length
    ? await admin
        .from("referrals")
        .select("id, referee_id, status, created_at, activated_at")
        .eq("referrer_id", session.userId)
        .order("created_at", { ascending: false })
    : { data: initialRows };
  const referrals = (finalRows ?? []) as ReferralRow[];
  const activatedCount = referrals.filter((r) => r.status === "activated").length;

  return (
    <div className="jb-fade mx-auto max-w-2xl space-y-5 px-5 py-8">
      <header>
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Invite friends
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your link — you and your friend each earn {REFERRAL_REWARD_POINTS} points once
          they activate a Binding account.
        </p>
      </header>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle>Your invite link</CardTitle>
          <CardDescription>
            Anyone who signs up through this link and completes onboarding pays out for both of
            you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteLinkCard link={inviteLink} />
        </CardContent>
      </Card>

      <Card className="jb-fade">
        <CardHeader>
          <CardTitle>Your referrals</CardTitle>
          <CardDescription data-testid="invite-activated-count">
            {activatedCount} activated · {referrals.length} total
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {referrals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No invites yet — share your link above to get started.
            </p>
          )}
          {referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              data-testid="invite-row"
            >
              <span className="text-sm text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} data-testid="invite-status">
                {STATUS_LABEL[r.status] ?? r.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
