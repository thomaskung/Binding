import { requireRole } from "@/lib/auth";
import { coerceRecruiterTier, recruiterTierLabel } from "@/lib/recruiter-tier";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@binding/ui";
import { PipelineList, type PipelineCard } from "./pipeline-list";

interface StrengthRow {
  profile_id: string;
  redacted_text: string;
  seniority_band: string | null;
  years_experience: number | null;
  skills: string[] | null;
  industries: string[] | null;
  desired_roles: string[] | null;
  region: string | null;
  credentials_summary: string | null;
}

/** Recruiter Dashboard (RecruiterMatchDashboard template): the aggregate
 * candidate pipeline across every one of the recruiter's roles. Reveal and
 * override actions stay on the per-job matches page — this view routes into
 * them. Salary expectations are deliberately absent pre-reveal: the
 * match_candidates RPC exposes only score + redacted text (privacy layer).
 */
export default async function RecruiterDashboard() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("recruiter_tier")
    .eq("id", session.userId)
    .maybeSingle();
  const recruiterTier = coerceRecruiterTier(profile?.recruiter_tier);

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("id, title")
    .eq("recruiter_id", session.userId);

  const jobIds = (jobs ?? []).map((j) => j.id);
  const titleByJob = new Map((jobs ?? []).map((j) => [j.id, j.title]));

  const [{ data: matches }, { data: reveals }, candidateTextResults] = await Promise.all([
    jobIds.length
      ? supabase
          .from("matches")
          .select("id, job_posting_id, profile_id, score, status")
          .in("job_posting_id", jobIds)
          .order("score", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    jobIds.length
      ? supabase
          .from("reveal_requests")
          .select(
            "profile_id, job_posting_id, status, profiles!reveal_requests_profile_id_fkey(display_name), message_threads(id)",
          )
          .in("job_posting_id", jobIds)
      : Promise.resolve({ data: [] as never[] }),
    Promise.all(
      jobIds.map((jobId) =>
        supabase
          .rpc("match_candidates", { p_job_id: jobId, p_threshold: 0, p_top_n: 100 })
          .then(({ data }) => ({ jobId, rows: (data ?? []) as StrengthRow[] })),
      ),
    ),
  ]);

  const strengthByJobProfile = new Map<string, StrengthRow>();
  for (const { jobId, rows } of candidateTextResults) {
    for (const row of rows) strengthByJobProfile.set(`${jobId}:${row.profile_id}`, row);
  }

  const revealByJobProfile = new Map(
    (reveals ?? []).map((r) => [`${r.job_posting_id}:${r.profile_id}`, r]),
  );

  const cards: PipelineCard[] = (matches ?? []).map((m) => {
    const reveal = revealByJobProfile.get(`${m.job_posting_id}:${m.profile_id}`);
    const revealedProfile = reveal
      ? Array.isArray(reveal.profiles)
        ? reveal.profiles[0]
        : reveal.profiles
      : null;
    const thread = reveal
      ? Array.isArray(reveal.message_threads)
        ? reveal.message_threads[0]
        : reveal.message_threads
      : null;
    const strength = strengthByJobProfile.get(`${m.job_posting_id}:${m.profile_id}`);
    return {
      id: m.id,
      jobId: m.job_posting_id,
      jobTitle: titleByJob.get(m.job_posting_id) ?? "Role",
      score: m.score,
      status: m.status,
      revealedName: m.status === "revealed" ? (revealedProfile?.display_name ?? null) : null,
      text: strength?.redacted_text ?? "",
      seniorityBand: strength?.seniority_band ?? null,
      yearsExperience: strength?.years_experience ?? null,
      skills: strength?.skills ?? [],
      industries: strength?.industries ?? [],
      desiredRoles: strength?.desired_roles ?? [],
      region: strength?.region ?? null,
      credentialsSummary: strength?.credentials_summary ?? null,
      threadId: reveal?.status === "accepted" ? (thread?.id ?? null) : null,
    };
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">
            Candidate matches
          </h1>
          {recruiterTier !== "free" && (
            <Badge variant="outline">{recruiterTierLabel(recruiterTier)}</Badge>
          )}
        </div>
        <p className="text-[15px] text-muted-foreground">
          {cards.length} candidate{cards.length === 1 ? "" : "s"} match your open roles
        </p>
      </header>
      <PipelineList cards={cards} />
    </main>
  );
}
