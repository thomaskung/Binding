/**
 * Progressive disclosure for the seeker profile edit form (DESIGN.md §13c).
 *
 * AI-first-prefill sequencing: fields the resume-upload extraction pipeline
 * (`extractProfileFields` -> `ExtractedProfileFields`: skills, roles,
 * industries, experience) or the maintenance-draft nudge already populate
 * show up FIRST/always ("essential") — low friction, "we already did this".
 * Fields that always require manual typing collapse behind a "Show more
 * fields" disclosure ("advanced"). `display_name` (core identity) and
 * `work_setups` (a compact checkbox row, already unconditionally rendered
 * pre-Phase-7) are essential too even though neither is AI-extracted — moving
 * either behind the toggle would be a regression, not a simplification.
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
  // Essential: AI-prefilled, or core identity / already-always-visible.
  display_name: "essential",
  skills: "essential",
  desired_roles: "essential",
  industries: "essential",
  experience: "essential",
  work_setups: "essential",

  // Advanced: always manual entry, collapsed behind "Show more fields".
  headline: "advanced",
  location: "advanced",
  phone: "advanced",
  min_salary: "advanced",
  equity_required: "advanced",
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
