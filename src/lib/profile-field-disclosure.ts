/**
 * Progressive disclosure for the seeker profile edit form (DESIGN.md §13c).
 *
 * AI-first-prefill sequencing: fields the resume-upload extraction pipeline
 * (`extractProfileFields` -> `ExtractedProfileFields`: skills, roles,
 * industries, experience) or the maintenance-draft nudge already populate
 * show up FIRST/always ("essential") — low friction, "we already did this".
 * Fields that always require manual typing collapse behind a "Show more
 * fields" disclosure ("advanced"). `display_name` (core identity) is
 * essential too even though it isn't AI-extracted — hiding it would be a
 * regression, not a simplification.
 *
 * `work_setups`, `min_salary`, and `equity_required` are also essential
 * despite being manual-entry: all three feed `dealbreaker_matrix`
 * (saveDraft/actions.ts) and directly gate which matches a seeker is shown.
 * Collapsing a hard matching dealbreaker behind an opt-in disclosure risks a
 * seeker never setting it (e.g. no salary floor) and silently matching
 * against jobs they'd have excluded — a friction-reduction goal cannot
 * override a matching-correctness one, so the whole dealbreaker group stays
 * essential together, not split by provenance.
 */

export type ProfileFieldKey =
  | "display_name"
  | "headline"
  | "location"
  | "phone"
  | "min_salary"
  | "equity_required"
  | "skills"
  | "desired_roles"
  | "industries"
  | "references_available"
  | "share_salary"
  | "credentials"
  | "experience"
  | "work_setups";

export type DisclosureTier = "essential" | "advanced";

export const PROFILE_FIELD_GROUPS: Record<ProfileFieldKey, DisclosureTier> = {
  // Essential: AI-prefilled, core identity, or a matching dealbreaker.
  display_name: "essential",
  skills: "essential",
  desired_roles: "essential",
  industries: "essential",
  experience: "essential",
  work_setups: "essential",
  min_salary: "essential",
  equity_required: "essential",

  // Advanced: always manual entry, non-dealbreaker, collapsed behind "Show more fields".
  headline: "advanced",
  location: "advanced",
  phone: "advanced",
  references_available: "advanced",
  share_salary: "advanced",
  credentials: "advanced",
};

export const ALL_PROFILE_FIELD_KEYS = Object.keys(
  PROFILE_FIELD_GROUPS,
) as ProfileFieldKey[];

export function essentialFields(): ProfileFieldKey[] {
  return ALL_PROFILE_FIELD_KEYS.filter((k) => PROFILE_FIELD_GROUPS[k] === "essential");
}

export function advancedFields(): ProfileFieldKey[] {
  return ALL_PROFILE_FIELD_KEYS.filter((k) => PROFILE_FIELD_GROUPS[k] === "advanced");
}

export function isAdvancedField(key: ProfileFieldKey): boolean {
  return PROFILE_FIELD_GROUPS[key] === "advanced";
}
