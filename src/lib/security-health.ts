/** Security Command Centre (DESIGN.md §14j, Phase 6): same deterministic,
 * proactive-flag pattern as src/lib/privacy-health.ts, applied to auth/
 * security signals instead of privacy ones. Pure function — plain data in
 * (extracted from the Supabase auth user object at the page level), flag
 * objects out, no DB/fetch inside.
 *
 * Kept deliberately small and grounded in data that actually exists today:
 * Supabase Auth exposes `user.identities` (linked sign-in providers) and
 * `user.email_confirmed_at`. Passkeys, recovery codes, and agent/API tokens
 * are NOT flagged here — those features don't exist yet (§14j's fuller
 * Security Command Centre scope is Phase 10/11, per the placeholder cards on
 * the security settings page). */

export interface SecurityHealthFlag {
  id: string;
  severity: "info" | "warning";
  message: string;
}

export interface SecurityHealthInput {
  now: Date;
  accountCreatedAt: Date;
  /** Provider names from `user.identities[].provider`, e.g. ["email"] or
   * ["email", "google"]. Always includes "email" for a magic-link account. */
  linkedProviders: readonly string[];
  emailConfirmedAt: Date | null;
}

export function computeSecurityHealthFlags(input: SecurityHealthInput): SecurityHealthFlag[] {
  const flags: SecurityHealthFlag[] = [];

  const hasNonEmailProvider = input.linkedProviders.some((p) => p !== "email");
  if (!hasNonEmailProvider) {
    flags.push({
      id: "no-additional-signin",
      severity: "info",
      message:
        "You're only signed in via magic-link email — consider linking Google as a backup sign-in method.",
    });
  }

  if (!input.emailConfirmedAt) {
    flags.push({
      id: "email-unverified",
      severity: "warning",
      message: "Your email address hasn't been verified yet.",
    });
  }

  return flags;
}
