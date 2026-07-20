import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { expireStaleOverride, getBalance, OVERRIDE_COMPENSATION } from "@/lib/points";
import { matchBand, type SeekerTier } from "@/lib/matching";
import { RoleSwitcher } from "@/components/role-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { OverrideResponseButtons } from "./override-response";
import { MatchList, type SeekerMatchCard } from "./match-list";
import { DevTierToggle } from "./dev-tier-toggle";

export default async function SeekerDashboard() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: matches }, { data: reveals }, balance] = await Promise.all([
    supabase
      .from("profiles")
      .select("published_text, visibility, seeker_tier")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("matches")
      .select(
        "id, status, score, created_at, job_postings(id, title, salary_min, salary_max, work_setups, profiles!job_postings_recruiter_id_fkey(company_name))",
      )
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reveal_requests")
      .select(
        "id, match_id, path, status, refunded, created_at, recruiter_id, job_postings(title), profiles!reveal_requests_recruiter_id_fkey(company_name, display_name), message_threads(id)",
      )
      .eq("profile_id", session.userId),
    getBalance(supabase, session.userId),
  ]);

  // Lazy expiry pass on any stale pending overrides (7-day window, no cron).
  // Each check is independent (short-circuits with zero DB calls unless the
  // reveal is actually a pending override past the window) — run in
  // parallel rather than serializing one round-trip per reveal.
  const admin = createSupabaseAdminClient();
  const expiryResults = await Promise.all(
    (reveals ?? []).map((r) =>
      expireStaleOverride(admin, {
        id: r.id,
        path: r.path,
        status: r.status,
        recruiter_id: r.recruiter_id,
        created_at: r.created_at,
        refunded: r.refunded,
      }),
    ),
  );
  const activeReveals = (reveals ?? []).map((r, i) =>
    expiryResults[i] ? { ...r, status: "declined" as const } : r,
  );

  const threadByMatch = new Map(
    activeReveals.map((r) => {
      const thread = Array.isArray(r.message_threads) ? r.message_threads[0] : r.message_threads;
      return [r.match_id, thread?.id ?? null] as const;
    }),
  );
  const pendingOverrides = activeReveals.filter(
    (r) => r.path === "override" && r.status === "pending",
  );
  const pendingByMatch = new Set(pendingOverrides.map((r) => r.match_id));

  // Rank (ordinal by true score desc) stands in for the raw score on the
  // client — "best match" sort works without ever exposing exact cosine
  // similarity to the seeker (matches.score is recruiter-only, migration 0001).
  const seekerTier: SeekerTier = profile?.seeker_tier === "pro" ? "pro" : "free";
  const byScoreDesc = [...(matches ?? [])].sort((a, b) => b.score - a.score);
  const rankByMatch = new Map(byScoreDesc.map((m, i) => [m.id, i + 1]));

  const cards: SeekerMatchCard[] = (matches ?? []).map((match) => {
    const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
    const company = job
      ? (Array.isArray(job.profiles) ? job.profiles[0] : job.profiles)?.company_name
      : null;
    return {
      id: match.id,
      title: job?.title ?? "Role",
      company: company ?? null,
      salaryMin: job?.salary_min ?? null,
      salaryMax: job?.salary_max ?? null,
      workSetups: job?.work_setups ?? [],
      status: match.status,
      band: matchBand(match.score, seekerTier),
      rank: rankByMatch.get(match.id) ?? Number.MAX_SAFE_INTEGER,
      pendingOverride: pendingByMatch.has(match.id),
      threadId: threadByMatch.get(match.id) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Your matches</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} role{cards.length === 1 ? "" : "s"} matched to your profile
          </p>
          {!profile?.published_text && (
            <p className="text-sm text-muted-foreground">
              Publish your profile to enter the matching pool.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <Badge variant="secondary">{balance} pts</Badge>
              <span className="text-xs text-muted-foreground">Balance</span>
            </div>
            <Button variant="outline" render={<Link href="/seeker/profile" />}>
              Manage profile
            </Button>
            <RoleSwitcher current="seeker" isSeeker={session.isSeeker} isRecruiter={session.isRecruiter} />
            <SignOutButton />
          </div>
          <DevTierToggle tier={seekerTier} />
        </div>
      </header>

      {!profile?.published_text && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">
              Finish your profile to enter the matching pool — it takes two minutes.
            </p>
            <Button size="sm" render={<Link href="/seeker/profile" />}>
              Finish profile
            </Button>
          </CardContent>
        </Card>
      )}

      {pendingOverrides.map((reveal) => {
        const job = Array.isArray(reveal.job_postings) ? reveal.job_postings[0] : reveal.job_postings;
        const recruiter = Array.isArray(reveal.profiles) ? reveal.profiles[0] : reveal.profiles;
        return (
          <Card key={reveal.id} className="border-primary" data-testid="pending-override-card">
            <CardHeader>
              <CardTitle className="text-lg">
                {recruiter?.company_name ?? recruiter?.display_name ?? "A recruiter"} revealed your
                profile
              </CardTitle>
              <CardDescription>
                For the role: {job?.title ?? "a job"}. You earned {OVERRIDE_COMPENSATION} pts for
                the reveal — accept to open the conversation, or decline (they cannot override you
                again for 30 days). Expires 7 days after the reveal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OverrideResponseButtons revealId={reveal.id} />
            </CardContent>
          </Card>
        );
      })}

      <MatchList cards={cards} />
    </main>
  );
}
