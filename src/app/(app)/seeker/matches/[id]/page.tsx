import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, CardContent, Separator } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { EMPLOYMENT_TYPE_LABEL, relativeDayLabel, salaryDisplay, type EmploymentType, type SalaryVisibility } from "@/lib/jobs";
import { matchBand, type SeekerTier } from "@/lib/matching";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MatchResponseButtons } from "../../match-response";
import { listScreeningQuestionsForJob } from "../../screening-actions";
import { CompanyResearch } from "./company-research";
import { ScreeningQuestions } from "./screening-questions";

const BAND_LABEL = { high: "High match", normal: "Normal match", low: "Low match" } as const;

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: match }, { data: profile }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, status, score, job_postings(id, title, description, salary_min, salary_max, salary_visibility, department, location, employment_type, skills, responsibilities, requirements, created_at, profiles!job_postings_recruiter_id_fkey(company_name))",
      )
      .eq("id", id)
      .eq("profile_id", session.userId)
      .maybeSingle(),
    supabase.from("profiles").select("seeker_tier").eq("id", session.userId).single(),
  ]);
  if (!match) notFound();

  const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
  if (!job) notFound();
  const company = (Array.isArray(job.profiles) ? job.profiles[0] : job.profiles)?.company_name ?? "This company";

  const { data: reveal } = await supabase
    .from("reveal_requests")
    .select("status, message_threads(id)")
    .eq("match_id", id)
    .eq("path", "override")
    .maybeSingle();
  const thread = reveal
    ? Array.isArray(reveal.message_threads)
      ? reveal.message_threads[0]
      : reveal.message_threads
    : null;

  // .catch()-guarded, same discipline as the Phase 2 dashboard-widget reads
  // (CLAUDE.md) — a screening-question lookup hiccup must not 500 a page
  // that previously couldn't fail that way.
  const screeningQuestions = await listScreeningQuestionsForJob(job.id).catch(() => []);

  const seekerTier: SeekerTier = profile?.seeker_tier === "pro" ? "pro" : "free";
  const band = matchBand(match.score, seekerTier);
  const employmentType = (job.employment_type ?? "fulltime") as EmploymentType;
  const visibility = (job.salary_visibility ?? "on_request") as SalaryVisibility;

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-8 p-8 pb-24">
      <Button variant="outline" size="sm" render={<Link href="/seeker/matches" />}>
        ← Back to matches
      </Button>

      <header className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-foreground">
          {company.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {company} · {job.location ?? "Location not specified"}
          </p>
        </div>
        <Badge>{BAND_LABEL[band]}</Badge>
      </header>

      <Card>
        <CardContent className="grid grid-cols-4 gap-4 py-5">
          <Fact label="Location" value={job.location ?? "—"} />
          <Fact label="Type" value={EMPLOYMENT_TYPE_LABEL[employmentType]} />
          <Fact label="Salary" value={salaryDisplay(job.salary_min, job.salary_max, visibility)} />
          <Fact label="Posted" value={relativeDayLabel(job.created_at)} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        {match.status === "surfaced" && <MatchResponseButtons matchId={match.id} />}
        {match.status !== "surfaced" && (
          <Badge
            variant={match.status === "interested" ? "default" : match.status === "revealed" ? "secondary" : "outline"}
          >
            {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
          </Badge>
        )}
        {match.status === "revealed" && reveal?.status === "accepted" && thread && (
          <Button size="sm" variant="secondary" render={<Link href={`/thread/${thread.id}`} />}>
            Message recruiter
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-8">
        <Section title="About the role">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description}</p>
        </Section>

        {job.responsibilities.length > 0 && (
          <>
            <Separator />
            <Section title="What you'll do">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
                {job.responsibilities.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>
          </>
        )}

        {job.requirements.length > 0 && (
          <>
            <Separator />
            <Section title="What we're looking for">
              <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
                {job.requirements.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>
          </>
        )}

        {job.skills.length > 0 && (
          <>
            <Separator />
            <Section title="Skills">
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill: string) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      {match.status === "surfaced" && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Interested in this role?</span>
            <span className="text-xs text-muted-foreground">
              Expressing interest lets the recruiter reveal your profile.
            </span>
          </div>
          <MatchResponseButtons matchId={match.id} />
        </div>
      )}

      <ScreeningQuestions jobId={job.id} initialQuestions={screeningQuestions} />
      <CompanyResearch jobId={job.id} companyName={company} />
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
