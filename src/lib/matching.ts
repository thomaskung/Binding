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

/** Match-quality band shown to seekers, gated by seeker_tier (DESIGN.md/
 * BUSINESS.md "Pro seeker $9.99/mo"). Below this the label caps at "normal"
 * for free seekers — the match itself still surfaces, only the top-tier
 * label is paywalled. There's no reachable "low" band today since
 * MATCH_COSINE_THRESHOLD (0.55) is also the surfacing floor; kept for when
 * that floor is ever lowered. */
export const HIGH_MATCH_THRESHOLD = Number(process.env.HIGH_MATCH_THRESHOLD ?? 0.85);

/** Mirrors the literal cap baked into `candidate_score_bonus()`
 * (`supabase/migrations/0033_skill_assessments.sql`) — no shared source of
 * truth since one lives in SQL and one in TS (same hand-sync discipline as
 * `passesDealbreakers` below). Bounds how much a verified-skill bonus can
 * ever move a persisted `matches.score`: it can shift a candidate WITHIN the
 * already-qualified (>= MATCH_COSINE_THRESHOLD) set, including across the
 * HIGH_MATCH_THRESHOLD boundary for a Pro-tier seeker (a real, intended
 * quality signal — see DESIGN.md §14b's built-note) — it can never pull a
 * below-threshold candidate into the qualified set at all (the bonus is
 * applied only to rows that already cleared the raw-score threshold/top-N
 * cut in the SQL function, never to the filter itself). */
export const VERIFIED_SKILL_BONUS_CAP = 0.1;

export type SeekerTier = "free" | "pro";
export type MatchBand = "high" | "normal" | "low";

/** Never pass the raw score to seeker-facing code/components — this band is
 * the only match-quality signal a seeker should ever see (matches.score is
 * recruiter-only, see migration 0001). */
export function matchBand(score: number, tier: SeekerTier): MatchBand {
  const trueBand: MatchBand =
    score >= HIGH_MATCH_THRESHOLD ? "high" : score >= MATCH_COSINE_THRESHOLD ? "normal" : "low";
  return trueBand === "high" && tier !== "pro" ? "normal" : trueBand;
}

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
 * match_candidates — keep the two in sync).
 *
 * Deliberately does NOT cover the fourth, SQL-only dealbreaker added in
 * migration 0033 (§14b): a job posting's `verified_skill_prefs` "required"
 * skills need a PASSED `assessment_attempts` row, which requires a live DB
 * query this function has no way to make — it operates purely on
 * already-loaded `profile`/`job` objects, by design, so it can be unit
 * tested without a database. Mirroring that check here would mean either
 * threading attempt data through this function's signature (this function
 * is called from UI-adjacent code that doesn't have it) or making it async
 * and DB-aware, both of which break its "pure function" contract for every
 * existing caller. The real dealbreaker enforcement lives only in SQL
 * (match_candidates/match_jobs_for_candidate's `WHERE ... not exists (...)`
 * clause) — this is a named, accepted gap in this function's coverage, not
 * an oversight. */
export function passesDealbreakers(
  dealbreakers: {
    min_salary?: number;
    work_setups?: string[];
    equity_required?: boolean;
  } | null,
  // salary_max is NOT NULL since migration 0024.
  job: { salary_max: number; work_setups: string[]; offers_equity: boolean },
): boolean {
  if (!dealbreakers) return true;
  if (
    dealbreakers.min_salary != null &&
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
  if (dealbreakers.equity_required && !job.offers_equity) {
    return false;
  }
  return true;
}
