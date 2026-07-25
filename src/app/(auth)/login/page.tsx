import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { resolveIntent, resolveOnboardingRedirect } from "@/lib/signup-intent";
import { LoginForm } from "./login-form";

/** Returning-user sign-in. Signed-in visitors are routed away by the same
 * intent-wins rule /signup and /onboarding use. Chrome (logo, terms line)
 * comes from the (auth) layout per the LoginFlow template. */
export default async function LoginPage({
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

  return <LoginForm intent={intent} />;
}
