import { redirect } from "next/navigation";
import { AuthNav } from "@/components/auth-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth";
import { resolveIntent, resolveOnboardingRedirect } from "@/lib/signup-intent";
import { OnboardingChooser } from "./chooser";

/** Role activation chooser. Both roles are opt-in; an account can hold one or
 * both (DESIGN.md §2a). Intent is checked BEFORE the already-onboarded
 * short-circuit — an existing seeker following "Sign up to hire talent" must
 * reach recruiter activation, not bounce to their dashboard. */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const { intent: rawIntent } = await searchParams;
  const destination = resolveOnboardingRedirect(session, resolveIntent(rawIntent));
  if (destination) redirect(destination);

  return (
    <div className="flex min-h-screen flex-col">
      <AuthNav context="authenticated" />
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Welcome to JumpOnBoard</CardTitle>
            <CardDescription>
              What brings you here? You can add the other role any time later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingChooser />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
