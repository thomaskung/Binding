import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardAction,
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
import { loadSeekerContext, OverrideBanners } from "./seeker-data";
import { MatchResponseButtons } from "./match-response";

const BAND_LABEL = { high: "High match", normal: "Normal match", low: "Low match" } as const;
const BAND_VARIANT = { high: "default", normal: "secondary", low: "outline" } as const;

function salaryLine(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Salary on request";
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return `${fmt((min ?? max)!)}+`;
}

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

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">Dashboard</h1>
          {seekerTier === "pro" && <Badge variant="outline">Pro</Badge>}
        </div>
        <Button variant="ghost" size="sm" render={<Link href="/seeker/points" />}>
          Points →
        </Button>
      </header>
      <p className="-mt-4 text-sm text-muted-foreground">Your matches and profile at a glance.</p>

      {seekerTier === "free" && (
        <Card data-testid="pro-upsell-card">
          <CardHeader>
            <CardTitle>Unlock more with Pro</CardTitle>
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

      {!published && (
        <>
          <Card>
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
        <Card data-testid="stale-nudge-card">
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
              <Card key={m.id} size="sm" data-testid="dashboard-match-card">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/seeker/matches/${m.id}`} className="hover:underline">
                      {m.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {[m.company, m.location].filter(Boolean).join(" · ") || "—"}
                  </CardDescription>
                  <CardAction>
                    <Badge variant={BAND_VARIANT[m.band]}>{BAND_LABEL[m.band]}</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-muted-foreground">
                    {salaryLine(m.salaryMin, m.salaryMax)}
                  </span>
                </CardContent>
                {!paused && m.status === "surfaced" && (
                  <CardFooter>
                    <MatchResponseButtons matchId={m.id} />
                  </CardFooter>
                )}
                {!paused && m.status !== "surfaced" && (
                  <CardFooter className="flex items-center gap-2">
                    <Badge variant="outline">
                      {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                    </Badge>
                    {m.status === "revealed" && m.threadId && (
                      <Button size="sm" variant="outline" render={<Link href={`/thread/${m.threadId}`} />}>
                        Open conversation
                      </Button>
                    )}
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
