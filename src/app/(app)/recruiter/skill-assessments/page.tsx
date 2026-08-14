import { requireRole } from "@/lib/auth";
import { listSkillAssessments } from "../skill-assessment-actions";
import { SkillAssessmentManager } from "./skill-assessment-manager";

/** Skill-assessment rubric bank management (DESIGN.md §14b, Phase 12).
 * Deliberately not added to RECRUITER_NAV (fixed list per CLAUDE.md) —
 * linked from the job editor's "Verified skills" section, the natural point
 * of need. */
export default async function SkillAssessmentsPage() {
  await requireRole("recruiter");
  const assessments = await listSkillAssessments();

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Skill assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Open-ended, AI-graded rubrics. Drafts are never visible to candidates until you publish.
        </p>
      </header>

      <SkillAssessmentManager initialAssessments={assessments} />
    </main>
  );
}
