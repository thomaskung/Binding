import { redirect } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Label, Separator } from "@jumponboard/ui";
import { getSessionProfile } from "@/lib/auth";
import { activateSeeker } from "../actions";
import { OnboardingChrome } from "./onboarding-chrome";

/** Seeker activation — step 1 of the wizard (SeekerOnboarding template's
 * consent gate): name + ToS + explicit AI-processing consent, mandatory
 * before any resume upload can happen. Checkbox copy is the compliance
 * wording, not the template's softer line — legal copy survives redesigns. */
export default async function SeekerOnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.isSeeker) redirect("/seeker");

  return (
    <OnboardingChrome current={1}>
      <form action={activateSeeker}>
        <Card>
          <CardHeader>
            <CardTitle>Before we start</CardTitle>
            <CardDescription>A quick consent check — this comes before anything else.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Full name</Label>
              <Input
                id="display_name"
                name="display_name"
                data-testid="onboard-name"
                defaultValue={session.displayName}
                placeholder="Wei Ling Tan"
                required
              />
              <p className="text-xs text-muted-foreground">
                Kept private. Recruiters only see it after a reveal you control.
              </p>
            </div>
            <label className="flex items-start gap-2.5 text-sm leading-snug">
              <input type="checkbox" name="tos" data-testid="onboard-tos" className="mt-0.5" required />
              <span>
                I agree to the Terms of Service and Privacy Policy{" "}
                <span className="text-xs text-muted-foreground">
                  (draft terms — pending legal review)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm leading-snug">
              <input
                type="checkbox"
                name="processing_consent"
                data-testid="onboard-consent"
                className="mt-0.5"
                required
              />
              <span>
                I consent to AI processing of my resume data: redaction of identifying details and
                conversion into an anonymized matching profile. Redaction reduces but cannot
                eliminate re-identification risk.
              </span>
            </label>
            <Separator />
            <p className="text-[13px] leading-normal text-muted-foreground">
              Your raw resume stays private to you — recruiters only ever see a redacted,
              skills-based profile.
            </p>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" data-testid="onboard-continue">
              Continue
            </Button>
          </CardFooter>
        </Card>
      </form>
    </OnboardingChrome>
  );
}
