import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { resolveIntent, resolveOnboardingRedirect } from "@/lib/signup-intent";
import { friendlyOAuthError } from "@/lib/auth-errors";
import { LoginForm } from "./login-form";

/** Returning-user sign-in. Signed-in visitors are routed away by the same
 * intent-wins rule /signup and /onboarding use. Chrome (logo, terms line)
 * comes from the (auth) layout per the LoginFlow template. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; error?: string; message?: string }>;
}) {
  const { intent: rawIntent, error, message } = await searchParams;
  const intent = resolveIntent(rawIntent);

  const session = await getSessionProfile();
  if (session) {
    redirect(resolveOnboardingRedirect(session, intent) ?? "/onboarding");
  }

  // `/auth/callback` redirects here on a failed code exchange (magic-link,
  // generic `?error=auth`) or a failed OAuth leg (`?error=auth&message=...`,
  // forwarded from GoTrue's `error_description` — see route.ts). Surface it
  // instead of silently landing on a blank-looking form.
  const initialError = message
    ? friendlyOAuthError(message)
    : error
      ? "That sign-in link didn't work — it may have expired. Please request a new one."
      : null;

  return <LoginForm intent={intent} initialError={initialError} />;
}
