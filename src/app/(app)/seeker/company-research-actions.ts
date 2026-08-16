"use server";

import { assertCompanyIdentifier, getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import {
  companyResearchCapGuard,
  countCompanyResearchRequestsToday,
  COMPANY_RESEARCH_DAILY_CAP,
  type CompanyResearchResult,
} from "@/lib/company-research";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * AI Company Research (DESIGN.md §14k, Phase 14) — a standalone,
 * candidate-facing feature. Cached per job posting (migration 0035); a
 * cache hit returns the stored summary with zero additional Modal or
 * web-search calls. Constants/types live in src/lib/company-research.ts,
 * not here — see that file's doc comment for why.
 */

/** Same ownership-proof check as src/app/(app)/seeker/screening-actions.ts's
 * assertMatchedToJob — duplicated locally rather than extracted into a
 * shared module, since each seeker-facing action file already owns its own
 * copy of this small check (the established pattern here, not an
 * oversight). The admin client bypasses RLS, so nothing else stops an
 * arbitrary jobId from being read without it. */
async function assertMatchedToJob(admin: ReturnType<typeof createSupabaseAdminClient>, profileId: string, jobId: string) {
  const { data, error } = await admin
    .from("matches")
    .select("id")
    .eq("profile_id", profileId)
    .eq("job_posting_id", jobId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`match ownership check failed: ${error.message}`);
  if (!data) throw new Error("no match found for this job");
}

/** Cache-first lookup. A hit returns immediately (no AI/search call, no rate
 * limit check — a cache hit is free) and never counts against
 * COMPANY_RESEARCH_DAILY_CAP. A miss is rate-limited BEFORE the real spend
 * (cap-checked-before-anything-else, same discipline as
 * assessmentAttemptCapGuard/screeningAnswerCapGuard) — the cache bounds
 * repeat views of the SAME posting, but does nothing about a seeker
 * clicking through many DISTINCT postings, which is exactly what this cap
 * exists to bound (this is the one feature whose spend lands on a metered
 * third-party account, not just Modal's own containers). On a miss:
 * resolves the job's company name, calls `AiProvider.researchCompany`
 * (which itself makes two real external calls — a web search, then a Modal
 * summarization — see modal.ts), and persists both the shared cache row and
 * this seeker's own request-log row before returning. */
export async function getCompanyResearch(jobId: string): Promise<CompanyResearchResult> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  await assertMatchedToJob(admin, session.userId, jobId);

  const { data: cached, error: cacheError } = await admin
    .from("company_research_cache")
    .select("summary")
    .eq("job_posting_id", jobId)
    .maybeSingle();
  if (cacheError) throw new Error(`company research cache lookup failed: ${cacheError.message}`);
  if (cached) return { summary: cached.summary };

  const usedToday = await countCompanyResearchRequestsToday(admin, session.userId);
  const capError = companyResearchCapGuard(usedToday, COMPANY_RESEARCH_DAILY_CAP);
  if (capError) throw new Error(capError);

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select("profiles!job_postings_recruiter_id_fkey(company_name)")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  const recruiterProfile = Array.isArray(job.profiles) ? job.profiles[0] : job.profiles;
  const companyName = recruiterProfile?.company_name?.trim();
  if (!companyName) throw new Error("this posting has no company name on file");

  const ai = getAiProvider();
  const summary = await ai.researchCompany(assertCompanyIdentifier(companyName));

  const { error: insertError } = await admin
    .from("company_research_cache")
    .insert({ job_posting_id: jobId, summary });
  if (insertError) throw new Error(`company research cache save failed: ${insertError.message}`);

  const { error: requestLogError } = await admin
    .from("company_research_requests")
    .insert({ profile_id: session.userId, job_posting_id: jobId });
  if (requestLogError) throw new Error(`company research request log failed: ${requestLogError.message}`);

  return { summary };
}
