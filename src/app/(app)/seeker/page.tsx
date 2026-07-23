import Link from "next/link";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@jumponboard/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { expireStaleOverride, getBalance, OVERRIDE_COMPENSATION } from "@/lib/points";
import { matchBand, type SeekerTier } from "@/lib/matching";
import { isStale } from "@/lib/profile";
import { getLifetimeEarnedPoints, benefitTierProgress } from "@/lib/benefits";
import { getTrainingCreditBalance } from "@/lib/training";
import { OverrideResponseButtons } from "./override-response";
import { MatchList, type SeekerMatchCard } from "./match-list";

const BAND_LABEL = { high: "High match", normal: "Normal match", low: "Low match" } as const;
const BAND_VARIANT = { high: "default", normal: "secondary", low: "outline" } as const;

export default async function SeekerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: matches }, { data: reveals }, balance] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, published_text, visibility, seeker_tier, last_profile_activity_at")
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

  const finishProfileBanner = !profile?.published_text && (
    <Card className="border-dashed">
      <CardContent className="flex items-center justify-between py-4">
        <p className="text-sm">Finish your profile to enter the matching pool — it takes two minutes.</p>
        <Button size="sm" render={<Link href="/seeker/profile" />}>
          Finish profile
        </Button>
      </CardContent>
    </Card>
  );

  const staleNudgeBanner = profile?.published_text && isStale(profile.last_profile_activity_at) && (
    <Card className="border-primary" data-testid="stale-nudge-card">
      <CardContent className="flex items-center justify-between py-4">
        <p className="text-sm">
          Your profile hasn&apos;t changed in a while — a quick update keeps your matches sharp.
        </p>
        <Button size="sm" render={<Link href="/seeker/nudge" />}>
          Draft update
        </Button>
      </CardContent>
    </Card>
  );

  const overrideBanners = pendingOverrides.map((reveal) => {
    const job = Array.isArray(reveal.job_postings) ? reveal.job_postings[0] : reveal.job_postings;
    const recruiter = Array.isArray(reveal.profiles) ? reveal.profiles[0] : reveal.profiles;
    return (
      <Card key={reveal.id} className="border-primary" data-testid="pending-override-card">
        <CardHeader>
          <CardTitle className="text-lg">
            {recruiter?.company_name ?? recruiter?.display_name ?? "A recruiter"} revealed your profile
          </CardTitle>
          <CardDescription>
            For the role: {job?.title ?? "a job"}. You earned {OVERRIDE_COMPENSATION} pts for the
            reveal — accept to open the conversation, or decline (they cannot override you again for
            30 days). Expires 7 days after the reveal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverrideResponseButtons revealId={reveal.id} />
        </CardContent>
      </Card>
    );
  });

  if (view === "matches") {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-8">
        <header className="jb-fade flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-medium tracking-tight">Job matches</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} role{cards.length === 1 ? "" : "s"} matched to your profile
          </p>
        </header>
        {finishProfileBanner}
        {staleNudgeBanner}
        {overrideBanners}
        <MatchList cards={cards} />
      </main>
    );
  }

  const firstName = (profile?.display_name || "there").split(" ")[0];
  const [trainingBalance, lifetimeEarned] = await Promise.all([
    getTrainingCreditBalance(supabase, session.userId),
    getLifetimeEarnedPoints(supabase, session.userId),
  ]);
  const { tier, fraction } = benefitTierProgress(lifetimeEarned);
  const ringDeg = Math.round(fraction * 360);
  const topMatches = [...cards]
    .filter((c) => c.status === "surfaced")
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="jb-fade flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Good to see you, {firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.published_text
            ? "Your profile is live and pseudonymized. Here's what's moving."
            : "Publish your profile to enter the matching pool."}
        </p>
      </header>

      {finishProfileBanner}
      {staleNudgeBanner}
      {overrideBanners}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>New matches</CardTitle>
            <CardDescription>Filtered by your dealbreakers</CardDescription>
            <CardAction>
              <Badge variant="secondary">{topMatches.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {topMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new matches yet.</p>
            ) : (
              topMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/seeker/matches/${m.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <span className="truncate">
                    {m.title}
                    {m.company ? <span className="text-muted-foreground"> · {m.company}</span> : null}
                  </span>
                  <Badge variant={BAND_VARIANT[m.band]} className="flex-none">
                    {BAND_LABEL[m.band]}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
          <CardContent className="pt-0">
            <Button variant="outline" size="sm" render={<Link href="/seeker?view=matches" />}>
              View all matches
            </Button>
          </CardContent>
        </Card>

        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>Benefits</CardTitle>
            <CardDescription>Loyalty tier, from lifetime points earned</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div
              className="flex size-16 flex-none items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${ringDeg}deg, var(--muted) 0deg)`,
              }}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-card">
                <span className="font-heading text-sm font-medium">T{tier}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{lifetimeEarned} lifetime points earned</span>
              <Button variant="outline" size="sm" render={<Link href="/benefits" />}>
                View benefits
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle>Training</CardTitle>
          <CardDescription>Reskill toward your target role</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-heading text-3xl font-medium">{trainingBalance}</span>
            <span className="text-xs text-muted-foreground">training credits</span>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/training" />}>
            Go to training
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
