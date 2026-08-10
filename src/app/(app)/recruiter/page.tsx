import Link from "next/link";
import { Badge, Button, Card, CardContent, Progress } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  detectStalePostings,
  detectExpiringReveals,
  computePostingMomentum,
  computeAggregateFunnel,
  daysUntilOverrideExpiry,
  type MatchRow,
  type RevealRequestRow,
  type FunnelStage,
} from "@/lib/pipeline-funnel";

interface JobPostingWithStatus {
  id: string;
  title: string;
  status: "draft" | "active" | "closed";
}

/**
 * Pipeline command-center (RecruiterDashboard in DESIGN.md): high-level
 * recruiter funnel + alerts + posting health.
 *
 * Single aggregate query for matches (no RPC calls), filtered by recruiter's
 * job IDs. Posting health computed from match cardinality per job.
 */
export default async function RecruiterPipelineCommandCenter() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title, status")
    .eq("recruiter_id", session.userId)
    .order("created_at", { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobsById = new Map(
    (jobs ?? []).map((j) => [j.id, j as JobPostingWithStatus])
  );

  // Single aggregate query: all matches for this recruiter's jobs
  const { data: matchRows } = jobIds.length
    ? await supabase
        .from("matches")
        .select("job_posting_id, status, created_at")
        .in("job_posting_id", jobIds)
    : { data: [] as MatchRow[] };

  const matches = (matchRows ?? []) as MatchRow[];

  // Aggregate funnel across all jobs
  const aggregateFunnel = computeAggregateFunnel(matches);

  // Posting-health data: matches per job + momentum
  const matchesByJob = new Map<string, MatchRow[]>();
  for (const match of matches) {
    const key = match.job_posting_id;
    if (!matchesByJob.has(key)) {
      matchesByJob.set(key, []);
    }
    matchesByJob.get(key)!.push(match);
  }

  const postingHealth = (jobs ?? []).map((job) => {
    const jobMatches = matchesByJob.get(job.id) ?? [];
    const momentum = computePostingMomentum(jobMatches);
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      cohortSize: jobMatches.length,
      momentum,
    };
  });

  // Alerts: stale postings & expiring reveals
  const stalePostingIds = detectStalePostings(matches);

  const { data: reveals } = jobIds.length
    ? await supabase
        .from("reveal_requests")
        .select("job_posting_id, profile_id, path, status, created_at")
        .in("job_posting_id", jobIds)
    : { data: [] as RevealRequestRow[] };

  const expiringReveals = detectExpiringReveals((reveals ?? []) as RevealRequestRow[]);

  // Format funnel for display
  const funnelStats: FunnelStage[] = [
    {
      key: "matched",
      label: "Matched",
      value: aggregateFunnel.matched,
      pct: 100,
    },
    {
      key: "interested",
      label: "Interested",
      value: aggregateFunnel.interested,
      pct:
        aggregateFunnel.matched === 0
          ? 0
          : Math.round((aggregateFunnel.interested / aggregateFunnel.matched) * 100),
    },
    {
      key: "revealed",
      label: "Revealed",
      value: aggregateFunnel.revealed,
      pct:
        aggregateFunnel.matched === 0
          ? 0
          : Math.round((aggregateFunnel.revealed / aggregateFunnel.matched) * 100),
    },
  ];

  return (
    <main className="jb-fade mx-auto max-w-4xl space-y-8 px-6 py-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">
          Pipeline
        </h1>
        <p className="text-sm text-muted-foreground">
          Conversion funnel across your {(jobs ?? []).length} job posting
          {(jobs ?? []).length === 1 ? "" : "s"}
        </p>
      </header>

      {/* Conversion funnel */}
      <Card className="jb-lift jb-fade">
        <CardContent className="flex flex-wrap items-center gap-6 pt-6">
          {funnelStats.map((f) => (
            <div key={f.key} className="min-w-0 flex-1">
              <div className="jb-serif text-2xl font-semibold leading-none tracking-tight">
                {f.value}
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground">{f.label}</div>
              <Progress value={f.pct} className="mt-1.5 h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Alerts section */}
      <section className="space-y-3">
        <h2 className="font-heading text-[15px] font-semibold tracking-tight">Alerts</h2>
        {stalePostingIds.size === 0 && expiringReveals.length === 0 ? (
          <Card className="jb-fade">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              All caught up. No stale postings or expiring reveals.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Stale postings */}
            {Array.from(stalePostingIds.entries()).map(([jobId, _]) => {
              const posting = jobsById.get(jobId);
              if (!posting) return null;
              return (
                <Card key={`stale-${jobId}`} className="jb-lift jb-fade">
                  <CardContent className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">No new matches in 7 days</p>
                      <p className="text-sm text-muted-foreground">{posting.title}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/recruiter/jobs/${jobId}`} />}
                    >
                      Review posting
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {/* Expiring reveals */}
            {expiringReveals.map((reveal) => {
              const posting = jobsById.get(reveal.job_posting_id);
              if (!posting) return null;
              const daysLeft = daysUntilOverrideExpiry(reveal.created_at);
              return (
                <Card key={`expiring-${reveal.profile_id}-${reveal.job_posting_id}`} className="jb-lift jb-fade">
                  <CardContent className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">Reveal expiring in {daysLeft} day{daysLeft === 1 ? "" : "s"}</p>
                      <p className="text-sm text-muted-foreground">
                        {posting.title} · Candidate approval pending
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/recruiter/jobs/${reveal.job_posting_id}/matches`} />}
                    >
                      View reveals
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Posting health */}
      <section className="space-y-3">
        <h2 className="font-heading text-[15px] font-semibold tracking-tight">Posting health</h2>
        {(jobs ?? []).length === 0 ? (
          <Card className="jb-fade">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No postings yet. Create a job to start matching candidates.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {postingHealth.map((posting) => {
              const momentum = posting.momentum;
              const trendColor =
                momentum.trend === "up"
                  ? "text-green-600"
                  : momentum.trend === "down"
                    ? "text-red-600"
                    : "text-muted-foreground";
              const trendSymbol =
                momentum.trend === "up" ? "↑" : momentum.trend === "down" ? "↓" : "→";

              return (
                <Card key={posting.id} className="jb-lift jb-fade">
                  <CardContent className="flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/recruiter/jobs/${posting.id}`}
                          className="font-heading text-[15px] font-semibold tracking-tight hover:underline"
                        >
                          {posting.title}
                        </Link>
                        <Badge
                          variant={
                            posting.status === "active"
                              ? "default"
                              : posting.status === "draft"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {posting.status.charAt(0).toUpperCase() + posting.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{posting.cohortSize} match{posting.cohortSize === 1 ? "" : "es"}</span>
                        <span className={trendColor}>
                          {trendSymbol} {momentum.thisWeek} this week
                          {momentum.lastWeek > 0 && ` (was ${momentum.lastWeek})`}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/recruiter/jobs/${posting.id}`} />}
                    >
                      View details
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
