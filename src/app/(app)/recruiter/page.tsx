import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

/** Recruiter Dashboard — interim redirect to the job-postings list until the
 * aggregate candidate-pipeline overview (RecruiterMatchDashboard template)
 * lands in Phase C of the strict-mockup pass. */
export default async function RecruiterDashboard() {
  await requireRole("recruiter");
  redirect("/recruiter/jobs");
}
