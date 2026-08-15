import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPublishedAssessmentSkills } from "../../skill-assessment-actions";
import type { EditableJob } from "../job-editor";
import { JobDetail } from "./job-detail";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [{ data: job }, { count }, publishedAssessmentSkills] = await Promise.all([
    supabase
      .from("job_postings")
      .select(
        "id, title, description, status, salary_min, salary_max, work_setups, department, location, employment_type, salary_visibility, offers_equity, skills, responsibilities, requirements, verified_skill_prefs, screening_enabled, screening_questions, screening_status, screening_prefs",
      )
      .eq("id", id)
      .eq("recruiter_id", session.userId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("job_posting_id", id),
    listPublishedAssessmentSkills(),
  ]);
  if (!job) notFound();

  return (
    <main className="jb-fade mx-auto max-w-3xl px-6 py-14">
      <JobDetail
        job={job as EditableJob}
        matchCount={count ?? 0}
        publishedAssessmentSkills={publishedAssessmentSkills}
      />
    </main>
  );
}
