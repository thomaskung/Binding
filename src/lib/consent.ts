/** Bump when ToS/consent wording changes — stored with each acceptance so a
 * future revision can trigger re-consent. Placeholder text pending legal
 * review (LEGAL_REVIEW.md scope).
 *
 * 2026-07-28: single AI-processing consent split three ways (LEGAL_REVIEW.md
 * Q14): processing/redaction + automated-profiling are REQUIRED (they are
 * the service); continuous AI maintenance is OPTIONAL and independently
 * withdrawable — see MAINTENANCE_CONSENT_VERSION below. */
export const CONSENT_VERSION = "2026-07-28-draft";

/** Market-signals opt-in (DESIGN.md §2e) — a SEPARATE consent from
 * CONSENT_VERSION above (AI-processing/redaction consent). Participating in
 * the aggregate market-intelligence product is independently opt-in and
 * revocable; bumping this must never imply re-consent to processing, or vice
 * versa. Placeholder text pending legal review (LEGAL_REVIEW.md Q7). */
export const MARKET_SIGNALS_CONSENT_VERSION = "2026-07-21-draft";

/** Continuous-AI-maintenance consent (DESIGN.md §2c) — OPTIONAL at
 * onboarding and withdrawable any time (mirrors the market-signals
 * pattern). The maintenance loop (requestMaintenanceDraft /
 * acceptMaintenanceUpdate) refuses to run without it; the nudge surface
 * shows a just-in-time consent prompt instead of silently processing.
 * Placeholder text pending legal review (LEGAL_REVIEW.md Q14). */
export const MAINTENANCE_CONSENT_VERSION = "2026-07-28-draft";

export interface SeekerConsentInput {
  tos: boolean;
  processing: boolean;
  profiling: boolean;
}

/** Pure validator for the seeker onboarding consent gate — the required set
 * is ToS + processing + profiling; maintenance is deliberately NOT here
 * (optional, LEGAL_REVIEW.md Q14). Returns an error message or null. */
export function validateSeekerConsent(input: SeekerConsentInput): string | null {
  if (!input.tos) return "the terms must be accepted to continue";
  if (!input.processing || !input.profiling) {
    return "the AI-processing and automated-matching consents are both required to continue";
  }
  return null;
}
