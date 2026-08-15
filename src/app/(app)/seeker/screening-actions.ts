"use server";

import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import {
  countScreeningAnswersToday,
  screeningAnswerCapGuard,
  SCREENING_ANSWER_DAILY_CAP,
  type ScreeningQuestion,
} from "@/lib/screening-questions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Seeker-facing screening-question answer flow (DESIGN.md §14c, Phase 13).
 * Only ever reads/returns question TEXT, never `rubric` — grading-only,
 * same posture as skill_assessments.rubric (src/app/(app)/seeker/
 * skill-assessment-actions.ts never exposes it either).
 */

export interface CandidateScreeningQuestion {
  id: string;
  question: string;
  answered: boolean;
  passed: boolean;
}

/** This action (and submitScreeningAnswer below) uses the service-role admin
 * client, which bypasses RLS — so unlike a direct PostgREST read, nothing
 * stops an arbitrary jobId from being passed in unless checked here. A
 * `matches` row is the same ownership proof the match-detail page itself
 * relies on (it only ever renders a match where profile_id = the caller),
 * so requiring one here closes off a seeker reading/answering another
 * employer's screening questions for a job they were never matched to. */
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

/** Published screening questions for one job, with this seeker's own prior
 * answers merged in. Empty if the job hasn't enabled/published screening
 * questions — the caller renders nothing in that case. */
export async function listScreeningQuestionsForJob(jobId: string): Promise<CandidateScreeningQuestion[]> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  await assertMatchedToJob(admin, session.userId, jobId);

  const [{ data: job, error: jobError }, { data: answers, error: answersError }] = await Promise.all([
    admin.from("job_postings").select("screening_enabled, screening_status, screening_questions").eq("id", jobId).single(),
    admin.from("candidate_screening_answers").select("question_id, passed").eq("job_posting_id", jobId).eq("profile_id", session.userId),
  ]);
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  if (answersError) throw new Error(`answer list failed: ${answersError.message}`);
  if (!job.screening_enabled || job.screening_status !== "published") return [];

  // Insert-only table (one row per attempt, see migration 0034's doc
  // comment) — "best attempt passes" here, same OR-across-attempts logic as
  // skill-assessment's listAvailableAssessments, so a later failed retry
  // never erases an earlier pass.
  const answeredById = new Map<string, boolean>();
  for (const a of answers ?? []) answeredById.set(a.question_id, answeredById.get(a.question_id) || a.passed);

  const questions = (job.screening_questions ?? []) as ScreeningQuestion[];
  return questions.map((q) => ({
    id: q.id,
    question: q.question,
    answered: answeredById.has(q.id),
    passed: answeredById.get(q.id) ?? false,
  }));
}

export interface ScreeningAnswerResult {
  passed: boolean;
}

/** Submit (or re-submit) an answer: rate-limit -> look up the question's
 * rubric server-side only -> grade (reusing gradeAssessmentAttempt, the same
 * generic rubric+answer grader Phase 12 built) -> insert a new row. Insert-
 * only, not upsert (migration 0034) — re-answering the same question adds a
 * new attempt row rather than overwriting the prior one, so
 * SCREENING_ANSWER_DAILY_CAP's row-count actually bounds the number of real
 * gradeAssessmentAttempt calls; an upsert would let unlimited free re-grades
 * silently collapse into one counted row. No anti-farming near-duplicate
 * check here (a deliberate, named scope difference from skill assessments,
 * not specified in §14c). */
export async function submitScreeningAnswer(
  jobId: string,
  questionId: string,
  answerText: string,
): Promise<ScreeningAnswerResult> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  const ai = getAiProvider();
  await assertMatchedToJob(admin, session.userId, jobId);

  const trimmed = answerText.trim();
  if (!trimmed) throw new Error("an answer is required");

  const usedToday = await countScreeningAnswersToday(admin, session.userId);
  const capError = screeningAnswerCapGuard(usedToday, SCREENING_ANSWER_DAILY_CAP);
  if (capError) throw new Error(capError);

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select("screening_enabled, screening_status, screening_questions")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  if (!job.screening_enabled || job.screening_status !== "published") {
    throw new Error("screening questions not available for this job");
  }
  const question = ((job.screening_questions ?? []) as ScreeningQuestion[]).find((q) => q.id === questionId);
  if (!question) throw new Error("question not found");

  const grade = await ai.gradeAssessmentAttempt(question.rubric, trimmed);

  const { error: insertError } = await admin.from("candidate_screening_answers").insert({
    job_posting_id: jobId,
    profile_id: session.userId,
    question_id: questionId,
    answer_text: trimmed,
    passed: grade.passed,
    rationale: grade.rationale,
  });
  if (insertError) throw new Error(`screening answer save failed: ${insertError.message}`);

  revalidatePath(`/seeker/matches`);
  return { passed: grade.passed };
}
