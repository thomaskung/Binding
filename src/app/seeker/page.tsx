import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/points";
import { SignOutButton } from "@/components/sign-out-button";
import { MatchResponseButtons } from "./match-response";

export default async function SeekerDashboard() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: matches }, { data: reveals }, balance] = await Promise.all([
    supabase
      .from("profiles")
      .select("published_text, visibility")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("matches")
      .select("id, status, created_at, job_postings(id, title, salary_min, salary_max, work_setups)")
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reveal_requests")
      .select("match_id, message_threads(id)")
      .eq("profile_id", session.userId),
    getBalance(supabase, session.userId),
  ]);

  const threadByMatch = new Map(
    (reveals ?? []).map((r) => {
      const thread = Array.isArray(r.message_threads) ? r.message_threads[0] : r.message_threads;
      return [r.match_id, thread?.id ?? null] as const;
    }),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your matches</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.published_text
              ? profile.visibility === "active"
                ? "Your pseudonymized profile is live in the pool."
                : "Your profile is paused — no new matches will surface."
              : "Publish your profile to enter the matching pool."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{balance} pts</Badge>
          <Button variant="outline" render={<Link href="/seeker/profile" />}>
            Manage profile
          </Button>
          <SignOutButton />
        </div>
      </header>

      {(matches ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No matches yet. Matches appear when an active job aligns with your
            skills and dealbreakers.
          </CardContent>
        </Card>
      ) : (
        (matches ?? []).map((match) => {
          const job = Array.isArray(match.job_postings)
            ? match.job_postings[0]
            : match.job_postings;
          return (
            <Card key={match.id} data-testid="seeker-match-card">
              <CardHeader>
                <CardTitle className="text-lg">{job?.title ?? "Role"}</CardTitle>
                <CardDescription>
                  {job?.salary_min != null && job?.salary_max != null
                    ? `$${job.salary_min.toLocaleString()} – $${job.salary_max.toLocaleString()} · `
                    : ""}
                  {(job?.work_setups ?? []).join(" / ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge
                  variant={
                    match.status === "revealed"
                      ? "default"
                      : match.status === "interested"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {match.status}
                </Badge>
                {match.status === "surfaced" && <MatchResponseButtons matchId={match.id} />}
                {match.status === "revealed" && threadByMatch.get(match.id) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    render={<Link href={`/thread/${threadByMatch.get(match.id)}`} />}
                  >
                    Open conversation
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
