import { redirect } from "next/navigation";
import { AuthNav } from "@/components/auth-nav";
import { getSessionProfile } from "@/lib/auth";
import { resolveIntent, resolveOnboardingRedirect } from "@/lib/signup-intent";
import { SignupForm } from "./signup-form";

/** Sign-up entry. Signed-in visitors never see the form — they're routed by
 * the same intent-wins rule /onboarding uses (an existing seeker following
 * "Sign up to hire talent" lands on recruiter activation, not their
 * dashboard). */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent: rawIntent } = await searchParams;
  const intent = resolveIntent(rawIntent);

  const session = await getSessionProfile();
  if (session) {
    redirect(resolveOnboardingRedirect(session, intent) ?? "/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AuthNav context="signup" />
      <main className="flex flex-1 items-center justify-center p-8">
        <SignupForm intent={intent} />
      </main>
    </div>
  );
}
