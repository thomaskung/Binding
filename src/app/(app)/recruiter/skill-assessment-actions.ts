"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Skill-assessment rubric bank management (DESIGN.md §14b, Phase 12) —
 * recruiter/founder-authored rubrics, not AI-generated (a deliberate scope
 * cut for this phase: the plan's load-bearing new AI capability is GRADING
 * an attempt, not drafting the rubric text itself; rubric generation stays
 * roadmap). A shared bank across every recruiter (same "founder-reviewed
 * bank" framing §13d used) — any recruiter can create/edit/publish/discard,
 * not siloed per-recruiter-account.
 *
 * Review-before-publish gate: rows land `draft` and are invisible to
 * candidates (src/app/(app)/seeker/skill-assessment-actions.ts only ever
 * reads `status = 'published'`) until an explicit `publishSkillAssessment`
 * call — same draft/active shape as `job_postings.status`.
 */

export interface SkillAssessmentSummary {
  id: string;
  skill: string;
  prompt: string;
  rubric: string;
  status: "draft" | "published";
  createdAt: string;
}

export async function listSkillAssessments(): Promise<SkillAssessmentSummary[]> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("skill_assessments")
    .select("id, skill, prompt, rubric, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`skill assessment list failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    skill: row.skill,
    prompt: row.prompt,
    rubric: row.rubric,
    status: row.status as "draft" | "published",
    createdAt: row.created_at,
  }));
}

/** Only skills with a PUBLISHED assessment can be set as a job's required/
 * weighted preference (src/lib/jobs.ts's job-editor UI filters on this) —
 * a draft rubric has no grading power yet. */
export async function listPublishedAssessmentSkills(): Promise<string[]> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("skill_assessments").select("skill").eq("status", "published");
  if (error) throw new Error(`published skill list failed: ${error.message}`);
  return [...new Set((data ?? []).map((r) => r.skill))];
}

export async function createSkillAssessment(input: {
  skill: string;
  prompt: string;
  rubric: string;
}): Promise<string> {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const skill = input.skill.trim();
  const prompt = input.prompt.trim();
  const rubric = input.rubric.trim();
  if (!skill || !prompt || !rubric) throw new Error("skill, prompt, and rubric are all required");

  const { data, error } = await admin
    .from("skill_assessments")
    .insert({ skill, prompt, rubric, created_by: session.userId })
    .select("id")
    .single();
  if (error || !data) throw new Error(`skill assessment create failed: ${error?.message ?? "no row returned"}`);
  revalidatePath("/recruiter/skill-assessments");
  return data.id;
}

export async function updateSkillAssessment(
  id: string,
  input: { prompt: string; rubric: string },
): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const prompt = input.prompt.trim();
  const rubric = input.rubric.trim();
  if (!prompt || !rubric) throw new Error("prompt and rubric are both required");

  const { error } = await admin
    .from("skill_assessments")
    .update({ prompt, rubric, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`skill assessment update failed: ${error.message}`);
  revalidatePath("/recruiter/skill-assessments");
}

/** The review-before-publish approval action — flips `draft` to
 * `published`, making the assessment visible/attemptable for candidates and
 * eligible to be set as a job's required/weighted skill preference. */
export async function publishSkillAssessment(id: string): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("skill_assessments")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`skill assessment publish failed: ${error.message}`);
  revalidatePath("/recruiter/skill-assessments");
}

/** Discard a draft the recruiter doesn't want to publish. Only drafts —
 * once published, an assessment may have real attempts/points/matching
 * effects riding on it, so this phase doesn't build an unpublish/delete path
 * for live assessments. */
export async function discardSkillAssessment(id: string): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("skill_assessments").delete().eq("id", id).eq("status", "draft");
  if (error) throw new Error(`skill assessment discard failed: ${error.message}`);
  revalidatePath("/recruiter/skill-assessments");
}

/** Per-job required/weighted skill preferences (migration 0033's
 * `job_postings.verified_skill_prefs`). A narrow save — mirrors
 * `saveDealbreakers`' "don't touch the rest of the form" shape — since
 * folding a jsonb object through the job-editor's FormData would be
 * awkward. `prefs` shape: `{ "<skill>": "required" | "weighted" }`. */
export async function updateVerifiedSkillPrefs(
  jobId: string,
  prefs: Record<string, "required" | "weighted">,
): Promise<void> {
  await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("job_postings").update({ verified_skill_prefs: prefs }).eq("id", jobId);
  if (error) throw new Error(`verified skill prefs update failed: ${error.message}`);
  revalidatePath(`/recruiter/jobs/${jobId}`);
}
