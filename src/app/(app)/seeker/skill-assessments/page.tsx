import { requireRole } from "@/lib/auth";
import { listAvailableAssessments } from "../skill-assessment-actions";
import { AssessmentTaker } from "./assessment-taker";

/** Seeker skill-assessment browse/attempt page (DESIGN.md §14b, Phase 12).
 * Only ever lists PUBLISHED assessments (listAvailableAssessments) — a
 * draft rubric is invisible here regardless of review progress. */
export default async function SkillAssessmentsPage() {
  await requireRole("seeker");
  const assessments = await listAvailableAssessments();

  return (
    <main className="jb-fade mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Skill assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Open-ended questions, graded against a recruiter-reviewed rubric. A pass earns points and
          can boost your ranking for jobs that value the skill.
        </p>
      </header>

      <AssessmentTaker initialAssessments={assessments} />
    </main>
  );
}
