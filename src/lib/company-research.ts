import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI Company Research (DESIGN.md §14k, Phase 14) — pure constants/types +
 * small DB helpers. Kept out of
 * src/app/(app)/seeker/company-research-actions.ts deliberately: a
 * "use server" file may only export async functions — a plain constant
 * export there silently invalidates ALL of that module's exports under
 * Next's production build (CLAUDE.md Gotchas, discovered the hard way in
 * Phase 10). `pnpm build`, not lint/typecheck/test, is what catches this.
 */

export const COMPANY_RESEARCH_DISCLAIMER =
  "AI-researched, aggregated public information — not verified or official.";

export interface CompanyResearchResult {
  summary: string;
}

/** Real cache-miss requests (fresh Brave + Modal spend) per day, per seeker,
 * across ALL job postings — same "AI-consuming feature, daily-capped" shape
 * as ASSESSMENT_ATTEMPTS_DAILY_CAP/SCREENING_ANSWER_DAILY_CAP. This one
 * matters more than most: it's the one feature whose spend lands on a
 * metered third-party account (Brave) with its own hard quota, not just
 * Modal's own containers — a seeker clicking through many distinct postings
 * has no other cost brake, since the cache only bounds REPEAT views of the
 * SAME posting. */
export const COMPANY_RESEARCH_DAILY_CAP = Number(process.env.COMPANY_RESEARCH_DAILY_CAP ?? 10);

/** Pure cap guard, same shape as assessmentAttemptCapGuard/screeningAnswerCapGuard —
 * checked before any real spend, not against cache hits (a cache hit is
 * free and must never count against this cap). */
export function companyResearchCapGuard(usedToday: number, dailyCap: number): string | null {
  if (usedToday >= dailyCap) {
    return `daily company-research limit reached (${dailyCap}/day)`;
  }
  return null;
}

/** Real (cache-miss) company-research requests by this profile, across all
 * jobs, in the last 24h. */
export async function countCompanyResearchRequestsToday(admin: SupabaseClient, profileId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("company_research_requests")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if (error) throw new Error(`company research request count failed: ${error.message}`);
  return count ?? 0;
}
