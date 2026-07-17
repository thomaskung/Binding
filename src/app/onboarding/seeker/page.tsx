import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSessionProfile } from "@/lib/auth";
import { activateSeeker } from "../actions";

/** Seeker activation — step 1 of the wizard: name + ToS + explicit
 * AI-processing consent (mandatory before any resume upload can happen). */
export default async function SeekerOnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.isSeeker) redirect("/seeker");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join the talent pool</CardTitle>
          <CardDescription>Step 1 of 3 — your name and consent.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={activateSeeker} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Your name</Label>
              <Input
                id="display_name"
                name="display_name"
                data-testid="onboard-name"
                defaultValue={session.displayName}
                placeholder="Full name"
                required
              />
              <p className="text-xs text-muted-foreground">
                Kept private. Recruiters only see it after a reveal you control.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="tos" data-testid="onboard-tos" className="mt-1" required />
              <span>
                I accept the Terms of Service{" "}
                <span className="text-xs text-muted-foreground">
                  (draft terms — pending legal review)
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="processing_consent"
                data-testid="onboard-consent"
                className="mt-1"
                required
              />
              <span>
                I consent to AI processing of my resume data: redaction of identifying details and
                conversion into an anonymized matching profile. Redaction reduces but cannot
                eliminate re-identification risk.
              </span>
            </label>
            <Button type="submit" className="w-full" data-testid="onboard-continue">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
