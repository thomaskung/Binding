import { requireRole } from "@/lib/auth";
import { JobEditor } from "../job-editor";

export default async function NewJobPage() {
  await requireRole("recruiter");
  return <JobEditor job={null} />;
}
