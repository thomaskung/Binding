"use server";

import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { earnSkillAssessmentPass } from "@/lib/points";
import {
  ASSESSMENT_ATTEMPTS_DAILY_CAP,
  assessmentAttemptCapGuard,
  countAttemptsToday,
} from "@/lib/skill-assessment";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Seeker-facing skill-assessment attempt flow (DESIGN.md §14b, Phase 12).
 * Only ever reads `status = 'published'` assessments — a draft rubric is
 * invisible here regardless of how far along it is in the recruiter's
 * review flow (src/app/(app)/recruiter/skill-assessment-actions.ts).
 */

export interface AvailableAssessment {
  id: string;
  skill: string;
  prompt: string;
  attempted: boolean;
  passed: boolean;
}

export async function listAvailableAssessments(): Promise<AvailableAssessment[]> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();

  const [{ data: assessments, error: assessmentsError }, { data: attempts, error: attemptsError }] =
    await Promise.all([
      admin.from("skill_assessments").select("id, skill, prompt").eq("status", "published"),
      admin.from("assessment_attempts").select("assessment_id, passed").eq("profile_id", session.userId),
    ]);
  if (assessmentsError) throw new Error(`assessment list failed: ${assessmentsError.message}`);
  if (attemptsError) throw new Error(`attempt list failed: ${attemptsError.message}`);

  const bestByAssessment = new Map<string, boolean>();
  for (const a of attempts ?? []) {
    bestByAssessment.set(a.assessment_id, bestByAssessment.get(a.assessment_id) || a.passed);
  }

  return (assessments ?? []).map((a) => ({
    id: a.id,
    skill: a.skill,
    prompt: a.prompt,
    attempted: bestByAssessment.has(a.id),
    passed: bestByAssessment.get(a.id) ?? false,
  }));
}

export interface AttemptResult {
  passed: boolean;
}

/** Submit an attempt: rate-limit -> insert (with embedding, placeholder
 * passed=false) -> duplicate check (by the new row's own id, see
 * is_duplicate_answer's doc comment in the migration for why it takes an id
 * rather than a raw vector) -> grade (skipped if duplicate) -> update the
 * row with the final verdict -> earn (on pass). A detected near-duplicate
 * answer is graded as an automatic fail WITHOUT calling the AI grader at
 * all — cheaper (no wasted Modal call on an answer that's going to fail
 * anyway) and removes any chance the grader itself is fooled by a
 * copy-pasted answer. */
export async function submitAssessmentAttempt(assessmentId: string, answerText: string): Promise<AttemptResult> {
  const session = await requireRole("seeker");
  const admin = createSupabaseAdminClient();
  const ai = getAiProvider();

  const trimmed = answerText.trim();
  if (!trimmed) throw new Error("an answer is required");

  const usedToday = await countAttemptsToday(admin, session.userId);
  const capError = assessmentAttemptCapGuard(usedToday, ASSESSMENT_ATTEMPTS_DAILY_CAP);
  if (capError) throw new Error(capError);

  const { data: assessment, error: assessmentError } = await admin
    .from("skill_assessments")
    .select("id, skill, rubric, status")
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentError) throw new Error(`assessment lookup failed: ${assessmentError.message}`);
  if (!assessment || assessment.status !== "published") throw new Error("assessment not available");

  const embedding = await ai.embed(trimmed);

  const { data: inserted, error: insertError } = await admin
    .from("assessment_attempts")
    .insert({
      assessment_id: assessmentId,
      profile_id: session.userId,
      answer_text: trimmed,
      embedding: JSON.stringify(embedding),
      passed: false,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(`attempt save failed: ${insertError?.message ?? "no row returned"}`);

  const { data: isDuplicate, error: dupError } = await admin.rpc("is_duplicate_answer", {
    p_attempt_id: inserted.id,
  });
  if (dupError) throw new Error(`duplicate check failed: ${dupError.message}`);

  let passed: boolean;
  let rationale: string;
  if (isDuplicate) {
    passed = false;
    rationale = "answer too similar to a prior submission on this assessment — not independently graded";
  } else {
    const grade = await ai.gradeAssessmentAttempt(assessment.rubric, trimmed);
    passed = grade.passed;
    rationale = grade.rationale;
  }

  const { error: updateError } = await admin
    .from("assessment_attempts")
    .update({ passed, rationale })
    .eq("id", inserted.id);
  if (updateError) throw new Error(`attempt grade save failed: ${updateError.message}`);

  if (passed) {
    await earnSkillAssessmentPass(admin, session.userId, assessmentId, assessment.skill);
  }

  revalidatePath("/seeker/skill-assessments");
  revalidatePath("/seeker");
  return { passed };
}
