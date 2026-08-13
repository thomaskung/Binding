import Link from "next/link";
import { Badge, Button, Card, CardContent, Progress } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { EMPLOYMENT_TYPE_LABEL, salaryDisplay, type EmploymentType, type SalaryVisibility } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeJobFunnel, type MatchRow, type FunnelStage } from "@/lib/pipeline-funnel";

const STATUS_VARIANT = { draft: "outline", active: "default", closed: "secondary" } as const;
const STATUS_LABEL = { draft: "Draft", active: "Active", closed: "Closed" } as const;

/** Job-postings list at its own route (mockup nav "Job postings" item) —
 * moved from /recruiter, which becomes the pipeline Dashboard. Funnel tiles
 * are a real Matched → Interested → Revealed breakdown of `matches.status`
 * (not the mockup's fabricated "momentum" figure, which has no backing data
 * here and is deliberately left unbuilt). */
export default async function RecruiterJobsPage() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "id, title, status, created_at, department, location, employment_type, salary_min, salary_max, salary_visibility",
    )
    .eq("recruiter_id", session.userId)
    .order("created_at", { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: matchRows } = jobIds.length
    ? await supabase.from("matches").select("job_posting_id, status, created_at").in("job_posting_id", jobIds)
    : { data: [] as MatchRow[] };

  const funnelByJob = new Map<string, FunnelStage[]>();
  for (const jobId of jobIds) {
    const rows = ((matchRows ?? []) as MatchRow[]).filter((r) => r.job_posting_id === jobId);
    funnelByJob.set(jobId, computeJobFunnel(rows));
  }

  const activeCount = (jobs ?? []).filter((j) => j.status === "active").length;

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">Job postings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {(jobs ?? []).length} posting{(jobs ?? []).length === 1 ? "" : "s"} · {activeCount} active
          </p>
        </div>
        <Button render={<Link href="/recruiter/jobs/new" />}>New posting</Button>
      </header>

      {(jobs ?? []).length === 0 ? (
        <Card className="jb-fade">
          <CardContent className="py-10 text-center text-muted-foreground">
            No postings yet. Post a job to see matched, pseudonymized candidates.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {(jobs ?? []).map((job) => {
            const employmentType = (job.employment_type ?? "fulltime") as EmploymentType;
            const visibility = (job.salary_visibility ?? "on_request") as SalaryVisibility;
            const metaLine = [job.department, job.location, EMPLOYMENT_TYPE_LABEL[employmentType]]
              .filter(Boolean)
              .join(" · ");
            const funnel = funnelByJob.get(job.id) ?? [];
            return (
              <Card key={job.id} className="jb-lift jb-fade">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/recruiter/jobs/${job.id}`}
                      className="font-heading text-[15px] font-semibold tracking-tight hover:underline"
                    >
                      {job.title}
                    </Link>
                    <Badge variant={STATUS_VARIANT[job.status as keyof typeof STATUS_VARIANT]}>
                      {STATUS_LABEL[job.status as keyof typeof STATUS_LABEL] ?? job.status}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{metaLine || "No details yet"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex flex-1 items-center gap-5">
                      {funnel.map((f) => (
                        <div key={f.key} className="min-w-0 flex-1">
                          <div className="jb-serif text-xl font-semibold leading-none tracking-tight">
                            {f.value}
                          </div>
                          <div className="mt-1 text-[10.5px] text-muted-foreground">{f.label}</div>
                          <Progress value={f.pct} className="mt-1.5 h-1.5" />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {salaryDisplay(job.salary_min, job.salary_max, visibility)}
                      </span>
                      <Button variant="outline" size="sm" render={<Link href={`/recruiter/jobs/${job.id}`} />}>
                        View posting
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
