import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@jumponboard/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLifetimeEarnedPoints, benefitTierProgress } from "@/lib/benefits";
import { getTrainingCreditBalance } from "@/lib/training";
import { loadSeekerContext, SeekerBanners } from "./seeker-data";

const BAND_LABEL = { high: "High match", normal: "Normal match", low: "Low match" } as const;
const BAND_VARIANT = { high: "default", normal: "secondary", low: "outline" } as const;

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
  const { profile, cards } = context;

  const supabase = await createSupabaseServerClient();
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
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Good to see you, {firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.published_text
            ? "Your profile is live and pseudonymized. Here's what's moving."
            : "Publish your profile to enter the matching pool."}
        </p>
      </header>

      <SeekerBanners context={context} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
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
            <Button variant="outline" size="sm" render={<Link href="/seeker/matches" />}>
              View all matches
            </Button>
          </CardContent>
        </Card>

        <Card>
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
                <span className="text-sm font-medium">T{tier}</span>
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

      <Card>
        <CardHeader>
          <CardTitle>Training</CardTitle>
          <CardDescription>Reskill toward your target role</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-3xl font-medium">{trainingBalance}</span>
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
