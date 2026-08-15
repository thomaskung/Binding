import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI-generated screening questions per job posting (DESIGN.md §14c, Phase
 * 13). Pure/testable pieces + small DB helpers live here; server actions
 * (generate/save/publish/answer) live in
 * src/app/(app)/recruiter/screening-actions.ts and
 * src/app/(app)/seeker/screening-actions.ts.
 */

export interface ScreeningQuestion {
  id: string;
  question: string;
  rubric: string;
}

/** Answers per day, per seeker, across ALL jobs' screening questions — same
 * daily-cap shape as ASSESSMENT_ATTEMPTS_DAILY_CAP (src/lib/skill-assessment.ts),
 * a deliberate addition beyond §14c's literal text: reusing gradeAssessmentAttempt
 * here is a real Modal call, and every other AI-consuming feature in this
 * codebase is daily-capped for cost containment — leaving this one uncapped
 * would be an inconsistency, not a simplification. */
export const SCREENING_ANSWER_DAILY_CAP = Number(process.env.SCREENING_ANSWER_DAILY_CAP ?? 10);

/** Pure cap guard, same shape as assessmentAttemptCapGuard/agentCallCapGuard —
 * checked before any grading call runs. */
export function screeningAnswerCapGuard(usedToday: number, dailyCap: number): string | null {
  if (usedToday >= dailyCap) {
    return `daily screening-answer limit reached (${dailyCap}/day)`;
  }
  return null;
}

/** Screening-answer submissions (by this profile, across all jobs) in the
 * last 24h. Insert-only table (migration 0034) — counting rows counts real
 * gradeAssessmentAttempt calls, same as countAttemptsToday for
 * assessment_attempts. */
export async function countScreeningAnswersToday(admin: SupabaseClient, profileId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("candidate_screening_answers")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if (error) throw new Error(`screening answer count failed: ${error.message}`);
  return count ?? 0;
}
