import Link from "next/link";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { EMPLOYMENT_TYPE_LABEL, salaryDisplay, type EmploymentType, type SalaryVisibility } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_VARIANT = { draft: "outline", active: "default", closed: "secondary" } as const;

/** Job-postings list at its own route (mockup nav "Job postings" item) —
 * moved from /recruiter, which becomes the pipeline Dashboard. */
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
    ? await supabase.from("matches").select("job_posting_id").in("job_posting_id", jobIds)
    : { data: [] as { job_posting_id: string }[] };
  const matchCountByJob = new Map<string, number>();
  for (const row of matchRows ?? []) {
    matchCountByJob.set(row.job_posting_id, (matchCountByJob.get(row.job_posting_id) ?? 0) + 1);
  }

  const activeCount = (jobs ?? []).filter((j) => j.status === "active").length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Job postings</h1>
          <p className="text-sm text-muted-foreground">
            {(jobs ?? []).length} posting{(jobs ?? []).length === 1 ? "" : "s"} · {activeCount} active
          </p>
        </div>
        <Button render={<Link href="/recruiter/jobs/new" />}>New posting</Button>
      </header>

      {(jobs ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No postings yet. Post a job to see matched, pseudonymized candidates.
          </CardContent>
        </Card>
      ) : (
        (jobs ?? []).map((job) => {
          const employmentType = (job.employment_type ?? "fulltime") as EmploymentType;
          const visibility = (job.salary_visibility ?? "public") as SalaryVisibility;
          const metaLine = [job.department, job.location, EMPLOYMENT_TYPE_LABEL[employmentType]]
            .filter(Boolean)
            .join(" · ");
          return (
            <Card key={job.id}>
              <CardHeader>
                <CardTitle className="text-lg font-medium">
                  <Link href={`/recruiter/jobs/${job.id}`} className="hover:underline">
                    {job.title}
                  </Link>
                </CardTitle>
                {metaLine && <CardDescription>{metaLine}</CardDescription>}
                <CardAction>
                  <Badge variant={STATUS_VARIANT[job.status as keyof typeof STATUS_VARIANT]}>
                    {job.status}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold tracking-tight">
                    {salaryDisplay(job.salary_min, job.salary_max, visibility)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {matchCountByJob.get(job.id) ?? 0} matched candidates
                  </span>
                </div>
                <Button variant="outline" size="sm" render={<Link href={`/recruiter/jobs/${job.id}`} />}>
                  View posting
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
