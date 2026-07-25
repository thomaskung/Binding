import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Button } from "@jumponboard/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RecruiterOnboardingWizard } from "./recruiter-onboarding-wizard";

/** Wizard steps 2-3: company details, then a first-job-post hand-off.
 * Skippable at every point — the dashboard is reachable without either. */
export default async function RecruiterOnboardingProfilePage() {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, company_name, recruiter_title, company_industry, company_size, phone")
    .eq("id", session.userId)
    .single();

  return (
    <div>
      <AuthNav context="authenticated" />
      <div className="mx-auto flex max-w-2xl items-center justify-end px-8 pt-6">
        <Button variant="ghost" size="sm" data-testid="recruiter-wizard-skip" render={<Link href="/recruiter" />}>
          Skip for now
        </Button>
      </div>
      <main className="p-8">
        <RecruiterOnboardingWizard
          displayName={profile?.display_name ?? ""}
          companyName={profile?.company_name ?? ""}
          recruiterTitle={profile?.recruiter_title ?? ""}
          companyIndustry={profile?.company_industry ?? ""}
          companySize={profile?.company_size ?? null}
          phone={profile?.phone ?? ""}
        />
      </main>
    </div>
  );
}
