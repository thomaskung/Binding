import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth";

/** Role activation chooser. Both roles are opt-in; an account can hold one or
 * both (DESIGN.md §2a). `?intent=seeker|recruiter` from the landing CTAs
 * pre-routes past this page. */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.onboarded) {
    redirect(session.isSeeker ? "/seeker" : "/recruiter");
  }

  const { intent } = await searchParams;
  if (intent === "seeker") redirect("/onboarding/seeker");
  if (intent === "recruiter") redirect("/onboarding/recruiter");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome to JumpOnBoard</CardTitle>
          <CardDescription>
            What brings you here? You can add the other role any time later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="h-28 flex-col"
            data-testid="choose-seeker"
            render={<Link href="/onboarding/seeker" />}
          >
            <span className="text-lg font-semibold">Find a job</span>
            <span className="text-xs text-muted-foreground">
              Join the talent pool, pseudonymously
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-28 flex-col"
            data-testid="choose-recruiter"
            render={<Link href="/onboarding/recruiter" />}
          >
            <span className="text-lg font-semibold">Hire talent</span>
            <span className="text-xs text-muted-foreground">
              Post roles, reveal matched candidates
            </span>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
