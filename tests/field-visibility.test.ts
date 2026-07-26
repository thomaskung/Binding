import { describe, expect, it } from "vitest";
import {
  availableModesFor,
  fieldMode,
  filterFieldsForSurface,
  type EmbeddingFieldValues,
  type FieldVisibilityMap,
} from "@/lib/field-visibility";

const VALUES: EmbeddingFieldValues = {
  skills: ["Node.js", "Postgres"],
  desiredRoles: ["Backend Engineer"],
  industries: ["Fintech"],
  referencesAvailable: true,
};

describe("fieldMode", () => {
  it("defaults to visible when unset", () => {
    expect(fieldMode(undefined, "skills")).toBe("visible");
    expect(fieldMode({}, "headline")).toBe("visible");
  });

  it("passes through an explicit mode for an embedding field", () => {
    const map: FieldVisibilityMap = { skills: "matching_only" };
    expect(fieldMode(map, "skills")).toBe("matching_only");
  });

  it("downgrades matching_only to hidden for a display-only field — matching_only would be a false promise there", () => {
    const map: FieldVisibilityMap = { headline: "matching_only" };
    expect(fieldMode(map, "headline")).toBe("hidden");
  });
});

describe("availableModesFor", () => {
  it("offers all three modes for embedding-fed fields", () => {
    expect(availableModesFor("skills")).toEqual(["visible", "matching_only", "hidden"]);
  });

  it("offers only visible/hidden for display-only fields", () => {
    expect(availableModesFor("location")).toEqual(["visible", "hidden"]);
  });
});

describe("filterFieldsForSurface", () => {
  it("includes everything visible on both surfaces by default", () => {
    expect(filterFieldsForSurface(VALUES, undefined, "display")).toEqual(VALUES);
    expect(filterFieldsForSurface(VALUES, undefined, "matching")).toEqual(VALUES);
  });

  it("hidden field is absent from BOTH display and matching", () => {
    const map: FieldVisibilityMap = { skills: "hidden" };
    expect(filterFieldsForSurface(VALUES, map, "display").skills).toEqual([]);
    expect(filterFieldsForSurface(VALUES, map, "matching").skills).toEqual([]);
  });

  it("matching_only field is absent from display but present for matching", () => {
    const map: FieldVisibilityMap = { industries: "matching_only" };
    expect(filterFieldsForSurface(VALUES, map, "display").industries).toEqual([]);
    expect(filterFieldsForSurface(VALUES, map, "matching").industries).toEqual(["Fintech"]);
  });

  it("applies independently per field", () => {
    const map: FieldVisibilityMap = {
      skills: "hidden",
      desired_roles: "matching_only",
      references_available: "hidden",
    };
    const display = filterFieldsForSurface(VALUES, map, "display");
    const matching = filterFieldsForSurface(VALUES, map, "matching");

    expect(display).toEqual({
      skills: [],
      desiredRoles: [],
      industries: ["Fintech"],
      referencesAvailable: false,
    });
    expect(matching).toEqual({
      skills: [],
      desiredRoles: ["Backend Engineer"],
      industries: ["Fintech"],
      referencesAvailable: false,
    });
  });
});
