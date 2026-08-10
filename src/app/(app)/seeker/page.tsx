import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Progress,
  cn,
} from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { isStale } from "@/lib/profile";
import { salaryDisplay } from "@/lib/jobs";
import { loadSeekerContext, OverrideBanners } from "./seeker-data";
import { MatchResponseButtons } from "./match-response";
import { LoyaltyLadderCard } from "./loyalty-ladder-card";
import TrainingCreditsCard from "./training-credits-card";

const BAND_LABEL = { high: "High match", normal: "Normal match", low: "Low match" } as const;
const BAND_VARIANT = { high: "default", normal: "secondary", low: "outline" } as const;

/** Adaptive seeker dashboard (SeekerDashboard template): a leading module
 * that changes by profile state — A incomplete (progress + upload CTA),
 * C published-but-stale (refresh nudge, paused matches dimmed), B published
 * & active (match list with express-interest actions; B2 Pro uncapped is
 * the same frame — band uncapping already happens server-side). */
export default async function SeekerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Legacy URL: the matches list lived at ?view=matches before it became a
  // path route (founder's no-query-param routing rule).
  const { view } = await searchParams;
  if (view === "matches") redirect("/seeker/matches");

  const session = await requireRole("seeker");
  const context = await loadSeekerContext(session.userId);
  const { profile, cards, seekerTier } = context;

  const published = !!profile?.published_text;
  const stale = published && isStale(profile?.last_profile_activity_at ?? null);
  const paused = profile?.visibility === "paused";

  // Frame A onboarding progress — real step completion, not the template's
  // placeholder numbers. Step 1 (name + consent) is done by construction:
  // requireRole("seeker") means activation completed.
  const dealbreakers = (profile?.dealbreaker_matrix ?? {}) as {
    min_salary?: number | null;
    work_setups?: string[];
  };
  const steps: Array<[label: string, done: boolean]> = [
    ["consent", true],
    ["resume", !!profile?.draft_text],
    ["skills", (profile?.skills ?? []).length > 0],
    ["dealbreakers", dealbreakers.min_salary != null || (dealbreakers.work_setups ?? []).length > 0],
    ["publish", published],
  ];
  const doneCount = steps.filter(([, done]) => done).length;
  const nextStep = steps.find(([, done]) => !done)?.[0];

  const staleSinceMonth = profile?.last_profile_activity_at
    ? new Date(profile.last_profile_activity_at).toLocaleString("en", { month: "long" })
    : null;

  const visibleCards = cards.filter((c) => c.status !== "declined").sort((a, b) => a.rank - b.rank);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="jb-fade mx-auto max-w-2xl space-y-5 px-5 py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
              {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
            </h1>
            {seekerTier === "pro" && <Badge variant="outline">Pro</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your profile is live and pseudonymized. Here&apos;s what&apos;s moving.
          </p>
        </div>
        <Button variant="ghost" size="sm" render={<Link href="/seeker/points" />}>
          Points →
        </Button>
      </header>

      {seekerTier === "free" && (
        <Card className="jb-lift bg-accent/40 ring-primary/30" data-testid="pro-upsell-card">
          <CardHeader>
            <CardTitle className="text-primary">Unlock more with Pro</CardTitle>
            <CardDescription>
              High-match badges, free training programs, and unlimited AI resume rewrites.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size="sm" render={<Link href="/seeker/profile/resume" />}>
              See what Pro unlocks
            </Button>
          </CardFooter>
        </Card>
      )}

      <OverrideBanners context={context} />

      <div className="grid gap-5 md:grid-cols-2">
        <LoyaltyLadderCard
          lifetimePoints={context.lifetimeEarnedPoints}
          partnerUnlocks={context.partnerUnlocks}
        />
        <TrainingCreditsCard
          balance={context.trainingCreditBalance}
          ledger={context.recentTrainingLedger}
          careerPathProgram={context.careerPathProgram}
          trainingCompletionCount={context.trainingCompletionCount}
        />
      </div>

      {!published && (
        <>
          <Card className="jb-lift">
            <CardHeader>
              <CardTitle>Finish your profile</CardTitle>
              <CardDescription>Add your resume so we can start matching you to roles</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Progress value={(doneCount / steps.length) * 100} />
              <span className="text-xs text-muted-foreground">
                {doneCount} of {steps.length} steps complete
                {nextStep ? ` — ${nextStep} pending` : ""}
              </span>
            </CardContent>
            <CardFooter>
              <Button className="w-full" render={<Link href="/onboarding/seeker/profile" />}>
                Upload your resume
              </Button>
            </CardFooter>
          </Card>
          <p className="text-center text-[13px] text-muted-foreground">
            Matches unlock once your profile is published.
          </p>
        </>
      )}

      {stale && (
        <Card className="jb-lift" data-testid="stale-nudge-card">
          <CardHeader>
            <CardTitle>
              Your profile hasn&apos;t moved{staleSinceMonth ? ` since ${staleSinceMonth}` : " in a while"}
            </CardTitle>
            <CardDescription>
              Roles and pay bands shift fast — a quick refresh keeps your matches accurate
            </CardDescription>
          </CardHeader>
          {paused && (
            <CardContent>
              <span className="text-[13px] text-muted-foreground">
                You&apos;ve paused active looking — matches below are on hold
              </span>
            </CardContent>
          )}
          <CardFooter>
            <Button className="w-full" render={<Link href="/seeker/nudge" />}>
              Draft update
            </Button>
          </CardFooter>
        </Card>
      )}

      {published && (
        <>
          {paused && (
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">
              Matches (paused)
            </span>
          )}
          <div className={cn("flex flex-col gap-3.5", paused && "opacity-60")}>
            {visibleCards.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No matches yet — new roles are matched against your profile as they&apos;re published.
              </p>
            )}
            {visibleCards.map((m) => (
              <Card key={m.id} size="sm" className="jb-lift" data-testid="dashboard-match-card">
                <div className="flex gap-4 px-4">
                  <div className="flex size-12 flex-none items-center justify-center rounded-xl bg-accent font-heading text-base font-semibold text-accent-foreground">
                    {(m.company ?? m.title).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/seeker/matches/${m.id}`}
                        className="font-heading text-sm font-medium leading-snug text-foreground hover:underline"
                      >
                        {m.title}
                      </Link>
                      <Badge variant={BAND_VARIANT[m.band]}>{BAND_LABEL[m.band]}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        m.company,
                        m.location,
                        salaryDisplay(m.salaryMin, m.salaryMax, m.salaryVisibility),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {!paused && m.status === "surfaced" && (
                      <div className="pt-1">
                        <MatchResponseButtons matchId={m.id} />
                      </div>
                    )}
                    {!paused && m.status !== "surfaced" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="outline">
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </Badge>
                        {m.status === "revealed" && m.threadId && (
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/thread/${m.threadId}`} />}
                          >
                            Open conversation
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
