import { describe, expect, it } from "vitest";
import { suppressBelowCohort } from "@/lib/market-signals";

describe("suppressBelowCohort (k-anonymity suppression, mirrors the SQL RPCs)", () => {
  it("returns the value when the cohort clears the threshold", () => {
    expect(suppressBelowCohort(25, "Rust", 20)).toEqual({
      value: "Rust",
      cohortSize: 25,
      suppressed: false,
    });
  });

  it("returns the value exactly at the threshold", () => {
    expect(suppressBelowCohort(20, "Go", 20)).toEqual({
      value: "Go",
      cohortSize: 20,
      suppressed: false,
    });
  });

  it("withholds the value (not the row) below the threshold", () => {
    expect(suppressBelowCohort(19, "Solidity", 20)).toEqual({
      value: null,
      cohortSize: null,
      suppressed: true,
    });
  });

  it("withholds a zero-count cohort too", () => {
    expect(suppressBelowCohort(0, "Cobol", 20)).toEqual({
      value: null,
      cohortSize: null,
      suppressed: true,
    });
  });
});
