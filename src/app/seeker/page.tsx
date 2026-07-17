import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { expireStaleOverride, getBalance, OVERRIDE_COMPENSATION } from "@/lib/points";
import { RoleSwitcher } from "@/components/role-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { MatchResponseButtons } from "./match-response";
import { OverrideResponseButtons } from "./override-response";

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
      .select(
        "id, status, created_at, job_postings(id, title, salary_min, salary_max, work_setups, profiles!job_postings_recruiter_id_fkey(company_name))",
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
  const admin = createSupabaseAdminClient();
  const activeReveals = [];
  for (const r of reveals ?? []) {
    const expired = await expireStaleOverride(admin, {
      id: r.id,
      path: r.path,
      status: r.status,
      recruiter_id: r.recruiter_id,
      created_at: r.created_at,
      refunded: r.refunded,
    });
    activeReveals.push(expired ? { ...r, status: "declined" as const } : r);
  }

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
          <RoleSwitcher current="seeker" isSeeker={session.isSeeker} isRecruiter={session.isRecruiter} />
          <SignOutButton />
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
          const company = job
            ? (Array.isArray(job.profiles) ? job.profiles[0] : job.profiles)?.company_name
            : null;
          return (
            <Card key={match.id} data-testid="seeker-match-card">
              <CardHeader>
                <CardTitle className="text-lg">
                  {job?.title ?? "Role"}
                  {company ? (
                    <span className="text-muted-foreground font-normal"> · {company}</span>
                  ) : null}
                </CardTitle>
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
                  {match.status === "revealed" && pendingByMatch.has(match.id)
                    ? "revealed — respond above"
                    : match.status}
                </Badge>
                {match.status === "surfaced" && <MatchResponseButtons matchId={match.id} />}
                {match.status === "revealed" &&
                  !pendingByMatch.has(match.id) &&
                  threadByMatch.get(match.id) && (
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
