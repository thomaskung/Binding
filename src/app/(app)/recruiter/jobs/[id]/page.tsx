import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EditableJob } from "../job-editor";
import { JobDetail } from "./job-detail";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const [{ data: job }, { count }] = await Promise.all([
    supabase
      .from("job_postings")
      .select(
        "id, title, description, status, salary_min, salary_max, work_setups, department, location, employment_type, salary_visibility, skills, responsibilities, requirements",
      )
      .eq("id", id)
      .eq("recruiter_id", session.userId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("job_posting_id", id),
  ]);
  if (!job) notFound();

  return (
    <main className="mx-auto max-w-3xl p-8">
      <JobDetail job={job as EditableJob} matchCount={count ?? 0} />
    </main>
  );
}
