import { requireRole } from "@/lib/auth";
import { JobEditor } from "../job-editor";

export default async function NewJobPage() {
  await requireRole("recruiter");
  return (
    <main className="mx-auto max-w-4xl p-8">
      <JobEditor job={null} />
    </main>
  );
}
