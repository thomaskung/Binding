/** Per-field profile visibility (Seeker Profile "Profile" tab, Phase 2B of
 * the JumpOnBoard.dc.html implementation). Tri-state per field:
 *   - visible        shown to recruiters, feeds matching (default)
 *   - matching_only   hidden from recruiters, still feeds matching
 *   - hidden          hidden from recruiters, excluded from matching
 *
 * `matching_only` is only offered for fields that actually feed the match
 * embedding (see experienceFactsSentence in src/lib/experience.ts) — for
 * headline/location, which never enter the embedding, "still helps your
 * matches" would be a false disclosure, so those fields only ever get
 * visible/hidden. This module is the single source of truth for that split
 * and is pure/isomorphic — used both server-side (publishProfile, the
 * pipeline that actually matters) and client-side (the live "recruiter sees
 * now" mirror preview), so both stay in lockstep by construction. */

export type FieldVisibilityMode = "visible" | "matching_only" | "hidden";

export const EMBEDDING_FIELD_KEYS = [
  "skills",
  "desired_roles",
  "industries",
  "references_available",
] as const;
export type EmbeddingFieldKey = (typeof EMBEDDING_FIELD_KEYS)[number];

export const DISPLAY_ONLY_FIELD_KEYS = ["headline", "location"] as const;
export type DisplayOnlyFieldKey = (typeof DISPLAY_ONLY_FIELD_KEYS)[number];

export type ProfileFieldKey = EmbeddingFieldKey | DisplayOnlyFieldKey;

export type FieldVisibilityMap = Partial<Record<ProfileFieldKey, FieldVisibilityMode>>;

function isDisplayOnlyKey(key: ProfileFieldKey): key is DisplayOnlyFieldKey {
  return (DISPLAY_ONLY_FIELD_KEYS as readonly string[]).includes(key);
}

/** Resolved mode for a field, defaulting to "visible" and downgrading a
 * (should-never-happen) "matching_only" on a display-only field to "hidden"
 * — the safe reading, since matching_only would be a lie for that field. */
export function fieldMode(map: FieldVisibilityMap | null | undefined, key: ProfileFieldKey): FieldVisibilityMode {
  const mode = map?.[key] ?? "visible";
  if (mode === "matching_only" && isDisplayOnlyKey(key)) return "hidden";
  return mode;
}

/** Which visibility modes are offered for a field in the UI — tri-state for
 * embedding-fed fields, binary for display-only ones. */
export function availableModesFor(key: ProfileFieldKey): FieldVisibilityMode[] {
  return isDisplayOnlyKey(key) ? ["visible", "hidden"] : ["visible", "matching_only", "hidden"];
}

function includedFor(
  map: FieldVisibilityMap | null | undefined,
  key: EmbeddingFieldKey,
  surface: "display" | "matching",
): boolean {
  const mode = fieldMode(map, key);
  return surface === "display" ? mode === "visible" : mode !== "hidden";
}

export interface EmbeddingFieldValues {
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  referencesAvailable: boolean;
}

/** Filters the embedding-fed fields down to what should feed a given
 * surface: "display" is what becomes skill_vectors.redacted_text (what
 * recruiters/fit-summary see), "matching" is what feeds ai.embed(). */
export function filterFieldsForSurface(
  values: EmbeddingFieldValues,
  map: FieldVisibilityMap | null | undefined,
  surface: "display" | "matching",
): EmbeddingFieldValues {
  return {
    skills: includedFor(map, "skills", surface) ? values.skills : [],
    desiredRoles: includedFor(map, "desired_roles", surface) ? values.desiredRoles : [],
    industries: includedFor(map, "industries", surface) ? values.industries : [],
    referencesAvailable: includedFor(map, "references_available", surface) ? values.referencesAvailable : false,
  };
}
