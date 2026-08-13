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
  searchParams: Promise<{ intent?: string; error?: string }>;
}) {
  const { intent: rawIntent, error } = await searchParams;
  const intent = resolveIntent(rawIntent);

  const session = await getSessionProfile();
  if (session) {
    redirect(resolveOnboardingRedirect(session, intent) ?? "/onboarding");
  }

  // `/auth/callback` redirects here on a failed code exchange with one of
  // two fixed codes — `error` is NEVER free text from the request (see
  // route.ts): that route is a public, unauthenticated GET endpoint, so any
  // value reflected onto this page verbatim would let an attacker craft a
  // link that displays attacker-chosen "error" text on the real login page.
  // Map the two known codes to fixed copy instead of ever interpolating a
  // request-controlled string.
  const initialError =
    error === "oauth"
      ? "There was a problem signing in with Google. Please try again or continue with your work email."
      : error === "auth"
        ? "That sign-in link didn't work — it may have expired. Please request a new one."
        : null;

  return <LoginForm intent={intent} initialError={initialError} />;
}
