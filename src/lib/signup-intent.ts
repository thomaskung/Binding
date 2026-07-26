/**
 * Signup/onboarding intent handling — one tested place for the `?intent=`
 * query param and the redirect rules that depend on it, shared by `/signup`,
 * `/login`, and `/onboarding` so the three pages can't drift out of sync.
 */

export type SignupIntent = "seeker" | "recruiter";

/** Validate a raw `?intent=` value. Garbage (anything that isn't exactly
 * "seeker" or "recruiter") resolves to null — callers show the role chooser
 * rather than silently guessing a role. */
export function resolveIntent(raw: string | null | undefined): SignupIntent | null {
  return raw === "seeker" || raw === "recruiter" ? raw : null;
}

export interface RoleFlags {
  isSeeker: boolean;
  isRecruiter: boolean;
  onboarded: boolean;
}

/**
 * Where should a signed-in user go, given their roles and an optional intent?
 *
 * Intent wins when it targets a role the user doesn't hold yet — an existing
 * seeker clicking "Sign up to hire talent" must reach recruiter activation,
 * not get bounced to their seeker dashboard (bug fixed 2026-07-18). Returns
 * null when there's nothing to redirect to (not onboarded, no intent) —
 * caller shows the onboarding chooser.
 */
export function resolveOnboardingRedirect(
  session: RoleFlags,
  intent: SignupIntent | null,
): string | null {
  if (intent === "seeker" && !session.isSeeker) return "/onboarding/seeker";
  if (intent === "recruiter" && !session.isRecruiter) return "/onboarding/recruiter";
  if (intent === "seeker" && session.isSeeker) return "/seeker";
  if (intent === "recruiter" && session.isRecruiter) return "/recruiter";
  if (session.onboarded) return session.isSeeker ? "/seeker" : "/recruiter";
  return null;
}
