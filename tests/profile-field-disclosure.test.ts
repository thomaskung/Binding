import { describe, expect, it } from "vitest";
import {
  ALL_PROFILE_FIELD_KEYS,
  PROFILE_FIELD_GROUPS,
  advancedFields,
  essentialFields,
  isAdvancedField,
  type ProfileFieldKey,
} from "@/lib/profile-field-disclosure";

// The full set of editable fields on the seeker profile edit form
// (profile-fields.tsx), enumerated independently of the module under test —
// this is what makes the "every field accounted for exactly once" assertion
// below meaningful rather than tautological.
const EXPECTED_KEYS: ProfileFieldKey[] = [
  "display_name",
  "headline",
  "location",
  "phone",
  "min_salary",
  "equity_required",
  "skills",
  "desired_roles",
  "industries",
  "references_available",
  "share_salary",
  "credentials",
  "experience",
  "work_setups",
];

describe("PROFILE_FIELD_GROUPS", () => {
  it("accounts for every real profile field exactly once", () => {
    expect(new Set(ALL_PROFILE_FIELD_KEYS)).toEqual(new Set(EXPECTED_KEYS));
    expect(ALL_PROFILE_FIELD_KEYS).toHaveLength(EXPECTED_KEYS.length);
  });

  it("splits essential and advanced with no overlap and no gaps", () => {
    const essential = essentialFields();
    const advanced = advancedFields();
    expect(new Set(essential).size + new Set(advanced).size).toBe(EXPECTED_KEYS.length);
    expect(essential.filter((k) => advanced.includes(k))).toHaveLength(0);
    expect(new Set([...essential, ...advanced])).toEqual(new Set(EXPECTED_KEYS));
  });

  it("marks AI-prefilled fields, core identity, and work setup as essential", () => {
    expect(essentialFields().sort()).toEqual(
      [
        "desired_roles",
        "display_name",
        "experience",
        "industries",
        "skills",
        "work_setups",
      ].sort(),
    );
  });

  it("collapses always-manual fields as advanced", () => {
    expect(advancedFields().sort()).toEqual(
      [
        "credentials",
        "equity_required",
        "headline",
        "location",
        "min_salary",
        "phone",
        "references_available",
        "share_salary",
      ].sort(),
    );
  });

  it("isAdvancedField agrees with the group map for every key", () => {
    for (const key of ALL_PROFILE_FIELD_KEYS) {
      expect(isAdvancedField(key)).toBe(PROFILE_FIELD_GROUPS[key] === "advanced");
    }
  });
});
