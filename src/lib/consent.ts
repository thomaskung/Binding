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

/** Connected-accounts (Google Drive) import consent (DESIGN.md §14a,
 * Phase 4) — a FOURTH independent consent, same shape as
 * MARKET_SIGNALS_CONSENT_VERSION above: optional, independently
 * withdrawable, and bumping it must never imply consent to/from any of the
 * other three. Required before the Drive OAuth connect flow starts
 * (/api/connected-accounts/google-drive/authorize) — this is a new,
 * non-essential input method (an alternative to pasting text or uploading a
 * PDF), not part of the core AI-processing consent above. Placeholder text
 * pending legal review (LEGAL_REVIEW.md scope). */
export const CONNECTED_ACCOUNTS_CONSENT_VERSION = "2026-08-13-draft";

/** Personal-agent/MCP access consent (DESIGN.md §14e, Phase 11) — a FIFTH
 * independent consent, same shape as CONNECTED_ACCOUNTS_CONSENT_VERSION:
 * optional, independently withdrawable, never implying/implied-by any other
 * consent here. Required before a seeker can issue an agent bearer token
 * (createAgentToken) — withdrawing it doesn't just stop future token
 * issuance, the MCP route re-checks it on every call, so withdrawal is a de
 * facto kill switch for every already-issued token too (this phase builds
 * no separate dedicated kill-switch mechanism — DESIGN.md §14e names one as
 * roadmap; this consent toggle already gives an equivalent, simpler lever).
 * Placeholder text pending legal review (LEGAL_REVIEW.md scope). */
export const AGENT_ACCESS_CONSENT_VERSION = "2026-08-14-draft";

export interface SeekerConsentInput {
  tos: boolean;
  processing: boolean;
  profiling: boolean;
}

/** Generic shape for one entry of CONSENT_REGISTRY below — enough metadata
 * for a future settings page (Phase 6) to render a list of consent toggles
 * without hand-wiring each one. Field choices map directly to how
 * src/app/onboarding/actions.ts and src/app/(app)/seeker/actions.ts actually
 * read/write consent_flags today — see CONSENT_REGISTRY doc comment. */
export interface ConsentRegistryEntry {
  /** Stable machine-readable identifier for this consent. Not itself
   * persisted anywhere — used for keying UI list items / tests. */
  key: "core" | "market_signals" | "maintenance" | "connected_accounts" | "agent_access";
  /** Human-readable name for a settings-page toggle/list item. */
  label: string;
  /** One- or two-sentence human-readable explanation of what this consent
   * covers, suitable for display next to the toggle. */
  description: string;
  /** The live version string for this consent — MUST equal the
   * corresponding exported *_CONSENT_VERSION constant above (asserted by
   * tests/consent.test.ts so the registry can never silently drift). */
  version: string;
  /** True only for the base ToS/processing/profiling bundle: accepted once
   * at seeker onboarding (validateSeekerConsent) and not independently
   * revocable from a settings page. All other consents are optional and
   * granted/withdrawn independently of this one and each other. */
  required: boolean;
  /** Whether this consent can be withdrawn at any time after being granted
   * (a settings-page toggle flips it off — see each *_CONSENT_VERSION
   * constant's own doc comment above). The required bundle is accepted once
   * and is not independently withdrawable — there is no "un-accept ToS and
   * keep using the account" path. */
  withdrawable: boolean;
  /** consent_flags column(s) (timestamptz, null = not currently granted)
   * that record when this consent was granted. Multiple columns for the
   * required bundle because tos/processing/profiling are stamped together
   * but remain semantically distinct fields in the table. */
  timestampColumns: readonly string[];
  /** consent_flags column (text, null = not currently granted) that stores
   * which version string was accepted for this consent. */
  versionColumn: string;
  /** Which account role(s) this consent applies to. `core` is written for
   * BOTH roles at onboarding, but asymmetrically: activateSeeker() stamps
   * tos_accepted_at + processing_consent_at + profiling_consent_at,
   * while activateRecruiter() only ever stamps tos_accepted_at (+
   * consent_version) — a recruiter-only profile has a non-null
   * consent_version with the other two timestamp columns left null. A
   * generic renderer must not treat "versionColumn is non-null" alone as
   * "fully granted" for a recruiter account; the other 3 consents are
   * seeker-only (gated by requireRole("seeker") in
   * src/app/(app)/seeker/actions.ts) and should not be rendered/toggled on
   * a recruiter-only settings view at all. */
  roles: readonly ("seeker" | "recruiter")[];
}

/** Registry wrapping the 4 independently-versioned consent constants above,
 * purely additive metadata for a future settings page (Phase 6) to render a
 * generic list of consent toggles from — no renames or behavior changes to
 * the constants/actions that already read and write consent_flags directly.
 *
 * Each entry's `version` must equal the constant it names; the
 * `timestampColumns`/`versionColumn` must equal the columns actually
 * upserted in src/app/onboarding/actions.ts (activateSeeker) and
 * src/app/(app)/seeker/actions.ts (updateMarketSignalsConsent /
 * updateMaintenanceConsent / updateConnectedAccountsConsent). */
export const CONSENT_REGISTRY: readonly ConsentRegistryEntry[] = [
  {
    key: "core",
    label: "AI processing & automated matching",
    description:
      "Redacting your resume for AI processing and running automated profile-to-job matching — required to use Binding as a seeker.",
    version: CONSENT_VERSION,
    required: true,
    withdrawable: false,
    timestampColumns: ["tos_accepted_at", "processing_consent_at", "profiling_consent_at"],
    versionColumn: "consent_version",
    roles: ["seeker", "recruiter"],
  },
  {
    key: "market_signals",
    label: "Aggregate market intelligence",
    description:
      "Contribute your profile signals to the aggregate market-wide skill-demand and salary-trend intelligence product.",
    version: MARKET_SIGNALS_CONSENT_VERSION,
    required: false,
    withdrawable: true,
    timestampColumns: ["market_signals_opt_in_at"],
    versionColumn: "market_signals_consent_version",
    roles: ["seeker"],
  },
  {
    key: "maintenance",
    label: "Continuous AI profile maintenance",
    description:
      "Let Binding proactively draft profile updates as your work history or skills change, subject to your review before anything is applied.",
    version: MAINTENANCE_CONSENT_VERSION,
    required: false,
    withdrawable: true,
    timestampColumns: ["maintenance_consent_at"],
    versionColumn: "maintenance_consent_version",
    roles: ["seeker"],
  },
  {
    key: "connected_accounts",
    label: "Connected accounts (Google Drive import)",
    description:
      "Allow importing resume or profile content from a connected Google Drive account.",
    version: CONNECTED_ACCOUNTS_CONSENT_VERSION,
    required: false,
    withdrawable: true,
    timestampColumns: ["connected_accounts_opt_in_at"],
    versionColumn: "connected_accounts_consent_version",
    roles: ["seeker"],
  },
  {
    key: "agent_access",
    label: "Personal agent / MCP access",
    description:
      "Let a personal AI agent you control read your match status, profile summary, and points balance through a scoped access token.",
    version: AGENT_ACCESS_CONSENT_VERSION,
    required: false,
    withdrawable: true,
    timestampColumns: ["agent_access_opt_in_at"],
    versionColumn: "agent_access_consent_version",
    roles: ["seeker"],
  },
];

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
