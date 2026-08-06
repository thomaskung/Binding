import { redirect } from "next/navigation";
import { Button, Card, CardContent, Input, Label } from "@binding/ui";
import { getSessionProfile } from "@/lib/auth";
import { activateRecruiter } from "../actions";
import { OnboardingChrome } from "../seeker/onboarding-chrome";

/** Recruiter activation — step 1 of 3 (shared OnboardingChrome, same
 * step-chrome as the seeker wizard): name + company/agency (shown to
 * candidates on jobs and threads — basic trust requirement) + ToS. Steps 2-3
 * (company details, first job post) live at /onboarding/recruiter/profile. */
export default async function RecruiterOnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.isRecruiter) redirect("/recruiter");

  return (
    <OnboardingChrome
      current={1}
      title="Start hiring"
      description="Candidates always see who's contacting them, so company identity is required."
    >
      <Card>
        <CardContent className="pt-6">
          <form action={activateRecruiter} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Your name</Label>
              <Input
                id="display_name"
                name="display_name"
                data-testid="recruiter-name"
                defaultValue={session.displayName}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Company / agency name</Label>
              <Input
                id="company_name"
                name="company_name"
                data-testid="recruiter-company"
                defaultValue={session.companyName ?? ""}
                placeholder="e.g. Apex Talent Partners"
                required
              />
              <p className="text-xs text-muted-foreground">
                Shown on your job postings and conversations. Unverified for now — verification is
                on the roadmap.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="tos"
                data-testid="recruiter-tos"
                className="mt-1 size-4 accent-primary"
                required
              />
              <span>
                I accept the Terms of Service{" "}
                <span className="text-xs text-muted-foreground">
                  (draft terms — pending legal review)
                </span>
              </span>
            </label>
            <Button type="submit" className="w-full" data-testid="recruiter-continue">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </OnboardingChrome>
  );
}
