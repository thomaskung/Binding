import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RecruiterOnboardingWizard } from "./recruiter-onboarding-wizard";

/** Wizard steps 2-3: company details, then a first-job-post hand-off.
 * Skippable at every point — the dashboard is reachable without either.
 * Chrome (step dots, skip link, title) is owned by the client wizard —
 * it's the only side that knows which of the two sub-steps is active. */
export default async function RecruiterOnboardingProfilePage() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, company_name, recruiter_title, company_industry, company_size, phone")
    .eq("id", session.userId)
    .single();

  return (
    <RecruiterOnboardingWizard
      displayName={profile?.display_name ?? ""}
      companyName={profile?.company_name ?? ""}
      recruiterTitle={profile?.recruiter_title ?? ""}
      companyIndustry={profile?.company_industry ?? ""}
      companySize={profile?.company_size ?? null}
      phone={profile?.phone ?? ""}
    />
  );
}
