"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { assertJDTextOnly, getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import type { ScreeningQuestion } from "@/lib/screening-questions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * AI-generated screening questions per job posting (DESIGN.md §14c, Phase
 * 13). Unlike Phase 12's skill_assessments (a shared cross-job bank), these
 * questions live directly on job_postings as a jsonb array — the
 * review-before-publish unit is the WHOLE per-job set (screening_status),
 * not one row per question. Draft rows are never candidate-visible
 * (src/app/(app)/seeker/screening-actions.ts only ever reads
 * screening_status = 'published').
 */

/** Draft candidate-facing questions + rubrics from the job's own description
 * text. Recruiter-authored input only (JDTextOnly) — suggest-and-approve:
 * the caller shows the returned drafts for review/edit before saving. IDs are
 * assigned here (not by the model) so they're stable across edits. */
export async function generateScreeningQuestionsFromJd(recruiterAuthoredJd: string): Promise<ScreeningQuestion[]> {
  await requireRole("recruiter");
  const ai = getAiProvider();
  const drafts = await ai.generateScreeningQuestions(assertJDTextOnly(recruiterAuthoredJd));
  return drafts.map((d) => ({ id: randomUUID(), question: d.question, rubric: d.rubric }));
}

/** Persist the recruiter's current (possibly hand-edited) question set as a
 * draft — does not touch screening_status, so an already-published set stays
 * published while the recruiter keeps iterating (mirrors updateSkillAssessment's
 * "edit anytime" posture, just scoped to this job's own array).
 *
 * Also prunes screening_prefs to only the question ids still present:
 * removing a question the recruiter had marked "required" would otherwise
 * leave a required-preference pointing at a question that no longer exists —
 * the matching RPCs' required-screening dealbreaker would then need a passed
 * answer to a question no candidate can ever answer, silently zeroing every
 * match for this job (a real, reachable case, not a hypothetical — an
 * already-published set is exactly the state where this bites). */
export async function saveScreeningQuestions(jobId: string, questions: ScreeningQuestion[]): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const cleaned = questions
    .map((q) => ({ id: q.id, question: q.question.trim(), rubric: q.rubric.trim() }))
    .filter((q) => q.question !== "" && q.rubric !== "");

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select("screening_prefs")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  const survivingIds = new Set(cleaned.map((q) => q.id));
  const prunedPrefs = Object.fromEntries(
    Object.entries((job.screening_prefs ?? {}) as Record<string, "required" | "weighted">).filter(([id]) =>
      survivingIds.has(id),
    ),
  );

  const { error } = await admin
    .from("job_postings")
    .update({ screening_questions: cleaned, screening_prefs: prunedPrefs })
    .eq("id", jobId);
  if (error) throw new Error(`screening questions save failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}

export async function setScreeningEnabled(jobId: string, enabled: boolean): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("job_postings").update({ screening_enabled: enabled }).eq("id", jobId);
  if (error) throw new Error(`screening enabled toggle failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}

/** The review-before-publish approval action — flips the WHOLE current
 * question set from draft to published at once, making it candidate-visible
 * and eligible for required/weighted preferences. Requires at least one
 * question; publishing an empty set would enable a toggle with nothing
 * behind it. */
export async function publishScreeningQuestions(jobId: string): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select("screening_questions")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  const questions = (job.screening_questions ?? []) as ScreeningQuestion[];
  if (questions.length === 0) throw new Error("cannot publish an empty screening-question set");

  const { error } = await admin.from("job_postings").update({ screening_status: "published" }).eq("id", jobId);
  if (error) throw new Error(`screening questions publish failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}

/** Revert to draft — hides the set from candidates again (existing answers
 * are untouched, same "no destructive rollback" posture as skill assessments'
 * publish-is-one-way stance, just reversible here since there's no per-row
 * publish state to lose). */
export async function unpublishScreeningQuestions(jobId: string): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("job_postings").update({ screening_status: "draft" }).eq("id", jobId);
  if (error) throw new Error(`screening questions unpublish failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}

/** Per-question required/weighted preferences (migration 0034's
 * job_postings.screening_prefs). Only settable once screening_status is
 * 'published' — mirrored server-side, not just hidden in the UI, since a
 * draft question set has no grading power yet (a required preference against
 * an unpublished question would silently exclude every candidate). */
export async function updateScreeningPrefs(
  jobId: string,
  prefs: Record<string, "required" | "weighted">,
): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .select("screening_status")
    .eq("id", jobId)
    .single();
  if (jobError || !job) throw new Error(`job lookup failed: ${jobError?.message ?? "no row returned"}`);
  if (job.screening_status !== "published") {
    throw new Error("screening questions must be published before setting required/weighted preferences");
  }

  const { error } = await admin.from("job_postings").update({ screening_prefs: prefs }).eq("id", jobId);
  if (error) throw new Error(`screening prefs update failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}
