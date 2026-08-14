/** Privacy Health Panel (DESIGN.md §14j, Phase 6): a DETERMINISTIC, not
 * AI-generated, list of proactive privacy flags — "still §2d adaptive-not-
 * generative, not model-emitted UI" per the design note. Pure function: all
 * inputs are plain data (timestamps/booleans/maps already fetched by the
 * settings page), no DB access or fetch happens in here, so this is fully
 * unit-testable without a database.
 *
 * The panel intentionally surfaces a SMALL number of flags (§14j: "2-3
 * flagged items") — computePrivacyHealthFlags returns everything that
 * currently applies; callers slice to the first few for display. */

import type { FieldVisibilityMap, ProfileFieldKey } from "./field-visibility";

export const CONSENT_STALE_MONTHS = 6;

export interface PrivacyHealthFlag {
  id: string;
  severity: "info" | "warning";
  message: string;
}

export interface PrivacyHealthInput {
  now: Date;
  /** Timestamp the core (required) processing/profiling consent was
   * accepted — `consent_flags.tos_accepted_at`. Never re-consented, so a
   * long-ago date here is the honest "haven't reviewed this in a while"
   * signal the panel is meant to surface. */
  coreConsentAcceptedAt: Date | null;
  maintenanceConsented: boolean;
  profileVisibility: "active" | "paused";
  overrideEnabled: boolean;
  fieldVisibility: FieldVisibilityMap;
  /** Fields actually offered a visibility control on the Privacy page —
   * pass the same key list the UI renders, so "fully open" reflects what a
   * seeker can actually see/change. */
  privacyFieldKeys: readonly ProfileFieldKey[];
}

/** True iff `date` is at-or-before the point exactly `months` months before
 * `now` — the boundary itself counts as stale (a consent accepted EXACTLY 6
 * months ago should already flag, not wait for day 181). */
function isAtOrBeforeMonthsAgo(date: Date, now: Date, months: number): boolean {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return date.getTime() <= cutoff.getTime();
}

export function computePrivacyHealthFlags(input: PrivacyHealthInput): PrivacyHealthFlag[] {
  const flags: PrivacyHealthFlag[] = [];

  if (
    input.coreConsentAcceptedAt &&
    isAtOrBeforeMonthsAgo(input.coreConsentAcceptedAt, input.now, CONSENT_STALE_MONTHS)
  ) {
    flags.push({
      id: "consent-stale",
      severity: "info",
      message: `You haven't reviewed your data-sharing consents in ${CONSENT_STALE_MONTHS}+ months — worth a quick look below.`,
    });
  }

  if (!input.maintenanceConsented) {
    flags.push({
      id: "maintenance-off",
      severity: "info",
      message: "Continuous AI profile maintenance is off — your profile may go stale over time.",
    });
  }

  if (input.profileVisibility === "paused") {
    flags.push({
      id: "profile-paused",
      severity: "warning",
      message: "Your profile is paused — you won't appear in new matches until you resume it.",
    });
  }

  const allVisible = input.privacyFieldKeys.every(
    (key) => (input.fieldVisibility[key] ?? "visible") === "visible",
  );
  if (allVisible && input.privacyFieldKeys.length > 0) {
    flags.push({
      id: "fields-fully-open",
      severity: "info",
      message: "Every profile field is set to visible to recruiters — review field-level visibility if you'd like to limit what's shown.",
    });
  }

  if (input.overrideEnabled) {
    flags.push({
      id: "override-enabled",
      severity: "info",
      message: "Paid reveal-override is on — a recruiter can reveal your name before you opt in (for a premium you can decline).",
    });
  }

  return flags;
}
