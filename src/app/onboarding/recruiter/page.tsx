import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSessionProfile } from "@/lib/auth";
import { activateRecruiter } from "../actions";

/** Recruiter activation: name + company/agency (shown to candidates on jobs
 * and threads — basic trust requirement) + ToS. */
export default async function RecruiterOnboardingPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.isRecruiter) redirect("/recruiter");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Start hiring</CardTitle>
          <CardDescription>
            Candidates always see who&apos;s contacting them — company identity is required.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <input type="checkbox" name="tos" data-testid="recruiter-tos" className="mt-1" required />
              <span>
                I accept the Terms of Service{" "}
                <span className="text-xs text-muted-foreground">
                  (draft terms — pending legal review)
                </span>
              </span>
            </label>
            <Button type="submit" className="w-full" data-testid="recruiter-continue">
              Start hiring
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
