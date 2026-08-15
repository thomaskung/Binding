import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Skill assessment, open-ended AI-graded (DESIGN.md §14b, Phase 12,
 * supersedes §13d's MCQ sketch). Pure/testable pieces + small DB helpers
 * live here; the actual server actions (create/publish/attempt) live in
 * src/app/(app)/recruiter/skill-assessment-actions.ts and
 * src/app/(app)/seeker/skill-assessment-actions.ts.
 */

/** Attempts per day, per seeker, across ALL assessments — same
 * "AI-consuming feature, daily-capped" shape as `AI_REFINE_CHAT_DAILY_CAP`
 * (src/lib/ai-usage.ts), the closest existing precedent (this repo has no
 * prior "points-earning action, capped" rate limit quite like this one —
 * `earnFreshnessConfirmation`'s is cooldown-based, not a daily count). */
export const ASSESSMENT_ATTEMPTS_DAILY_CAP = Number(process.env.ASSESSMENT_ATTEMPTS_DAILY_CAP ?? 5);

/** Mirrors the literal default baked into `is_duplicate_answer()`
 * (`supabase/migrations/0033_skill_assessments.sql`) — no shared source of
 * truth since one lives in SQL and one in TS (same hand-sync discipline as
 * `VERIFIED_SKILL_BONUS_CAP`). Deliberately near-identical-text-only (0.97
 * cosine) — a genuine paraphrase should score well below this and never be
 * flagged. */
export const DUPLICATE_ANSWER_SIMILARITY_THRESHOLD = 0.97;

/** Pure cap guard, same shape as `agentCallCapGuard`/`revealSpendGuard` —
 * cap-checked before any grading call runs (an attempt that would exceed
 * the cap never reaches the AI provider at all, so it can't burn Modal cost
 * on a call that's going to be rejected anyway). */
export function assessmentAttemptCapGuard(usedToday: number, dailyCap: number): string | null {
  if (usedToday >= dailyCap) {
    return `daily assessment attempt limit reached (${dailyCap}/day)`;
  }
  return null;
}

/** Attempts (by this profile, across all assessments) in the last 24h. */
export async function countAttemptsToday(admin: SupabaseClient, profileId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("assessment_attempts")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if (error) throw new Error(`assessment attempt count failed: ${error.message}`);
  return count ?? 0;
}
