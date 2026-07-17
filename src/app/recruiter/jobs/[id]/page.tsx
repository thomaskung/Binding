import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobEditor, type EditableJob } from "../job-editor";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title, description, status, salary_min, salary_max, work_setups")
    .eq("id", id)
    .eq("recruiter_id", session.userId)
    .maybeSingle();
  if (!job) notFound();

  return <JobEditor job={job as EditableJob} />;
}
