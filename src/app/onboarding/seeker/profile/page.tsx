import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./onboarding-wizard";

/** Wizard steps 2-3, resume-first (DESIGN.md §2c): resume upload/paste with
 * AI-extraction suggest-and-approve, then dealbreakers, then publish.
 * Skippable at every point — the dashboard shows a finish-profile banner
 * until published. */
export default async function SeekerOnboardingProfilePage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: experience }] = await Promise.all([
    supabase
      .from("profiles")
      .select("draft_text, dealbreaker_matrix, skills, desired_roles, industries")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("seeker_experience")
      .select("role, company, industry, start_date, end_date")
      .eq("profile_id", session.userId)
      .order("start_date", { ascending: false }),
  ]);

  const dealbreakers = (profile?.dealbreaker_matrix ?? {}) as {
    min_salary?: number | null;
    work_setups?: string[];
  };

  return (
    <div>
      <AuthNav context="authenticated" />
      <div className="mx-auto flex max-w-2xl items-center justify-end px-8 pt-6">
        <Button variant="ghost" size="sm" data-testid="wizard-skip" render={<Link href="/seeker" />}>
          Skip for now
        </Button>
      </div>
      <main className="p-8">
        <OnboardingWizard
          draftText={profile?.draft_text ?? ""}
          skills={profile?.skills ?? []}
          desiredRoles={profile?.desired_roles ?? []}
          industries={profile?.industries ?? []}
          experience={(experience ?? []).map((e) => ({
            role: e.role,
            company: e.company,
            industry: e.industry,
            startDate: e.start_date,
            endDate: e.end_date,
          }))}
          minSalary={dealbreakers.min_salary ?? null}
          workSetups={dealbreakers.work_setups ?? []}
        />
      </main>
    </div>
  );
}
