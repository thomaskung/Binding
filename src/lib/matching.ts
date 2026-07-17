import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Matching parameters. Placeholder calibration — recalibrate with real beta
 * data (VISION.md evaluation cadence).
 *
 * Roadmap note (not built yet): richer "why this match" explanations surfaced
 * to paid tiers, LinkedIn-style — free tier sees the match, paid tier sees
 * the reasoning. Keep the fit-summary generation pluggable for that.
 */
export const MATCH_TOP_N = Number(process.env.MATCH_TOP_N ?? 20);
export const MATCH_COSINE_THRESHOLD = Number(process.env.MATCH_COSINE_THRESHOLD ?? 0.55);

export interface CandidateMatch {
  profile_id: string;
  score: number;
  redacted_text: string;
}

/** Run similarity + dealbreaker filtering via the match_candidates RPC
 * (security definer — returns pseudonymized fields only). */
export async function findCandidatesForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<CandidateMatch[]> {
  const { data, error } = await supabase.rpc("match_candidates", {
    p_job_id: jobId,
    p_threshold: MATCH_COSINE_THRESHOLD,
    p_top_n: MATCH_TOP_N,
  });
  if (error) throw new Error(`match_candidates failed: ${error.message}`);
  return (data ?? []) as CandidateMatch[];
}

/** Persist surfaced matches for a job (idempotent upsert on the per-role
 * unique constraint). Called after a job is published/re-embedded. */
export async function refreshMatchesForJob(
  admin: SupabaseClient,
  jobId: string,
): Promise<number> {
  const candidates = await findCandidatesForJob(admin, jobId);
  if (candidates.length === 0) return 0;

  const rows = candidates.map((c) => ({
    job_posting_id: jobId,
    profile_id: c.profile_id,
    score: c.score,
  }));
  const { error } = await admin
    .from("matches")
    .upsert(rows, { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true });
  if (error) throw new Error(`match upsert failed: ${error.message}`);
  return rows.length;
}

/** Reverse direction: after a candidate publishes, surface every active job
 * they clear (match_jobs_for_candidate RPC) and persist the matches. Fixes
 * the gap where late-joining candidates stayed invisible until a recruiter
 * re-published. */
export async function refreshMatchesForProfile(
  admin: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { data, error } = await admin.rpc("match_jobs_for_candidate", {
    p_profile_id: profileId,
    p_threshold: MATCH_COSINE_THRESHOLD,
    p_top_n: MATCH_TOP_N,
  });
  if (error) throw new Error(`match_jobs_for_candidate failed: ${error.message}`);

  const jobs = (data ?? []) as { job_posting_id: string; score: number }[];
  if (jobs.length === 0) return 0;

  const rows = jobs.map((j) => ({
    job_posting_id: j.job_posting_id,
    profile_id: profileId,
    score: j.score,
  }));
  const { error: upsertError } = await admin
    .from("matches")
    .upsert(rows, { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true });
  if (upsertError) throw new Error(`match upsert failed: ${upsertError.message}`);
  return rows.length;
}

/** Dealbreaker filter, extracted for unit testing (mirrors the SQL in
 * match_candidates — keep the two in sync). */
export function passesDealbreakers(
  dealbreakers: { min_salary?: number; work_setups?: string[] } | null,
  job: { salary_max: number | null; work_setups: string[] },
): boolean {
  if (!dealbreakers) return true;
  if (
    dealbreakers.min_salary != null &&
    job.salary_max != null &&
    job.salary_max < dealbreakers.min_salary
  ) {
    return false;
  }
  if (
    dealbreakers.work_setups &&
    dealbreakers.work_setups.length > 0 &&
    !dealbreakers.work_setups.some((s) => job.work_setups.includes(s))
  ) {
    return false;
  }
  return true;
}
