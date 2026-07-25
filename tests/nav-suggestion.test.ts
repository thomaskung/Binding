import { describe, expect, it } from "vitest";
import { suggestionForRecruiter, suggestionForSeeker } from "@/lib/nav-suggestion";

describe("suggestionForSeeker", () => {
  it("prioritizes stale-profile over new matches when both are true", () => {
    expect(suggestionForSeeker(true, 3)).toBe("Refresh your profile");
  });

  it("shows singular match copy for exactly one", () => {
    expect(suggestionForSeeker(false, 1)).toBe("1 new match");
  });

  it("shows plural match copy for more than one", () => {
    expect(suggestionForSeeker(false, 4)).toBe("4 new matches");
  });

  it("caps the displayed count at 9+", () => {
    expect(suggestionForSeeker(false, 42)).toBe("9+ new matches");
  });

  it("returns null when neither signal is true", () => {
    expect(suggestionForSeeker(false, 0)).toBeNull();
  });
});

describe("suggestionForRecruiter", () => {
  it("shows singular candidate copy for exactly one", () => {
    expect(suggestionForRecruiter(1)).toBe("1 candidate to review");
  });

  it("shows plural candidate copy for more than one", () => {
    expect(suggestionForRecruiter(5)).toBe("5 candidates to review");
  });

  it("caps the displayed count at 9+", () => {
    expect(suggestionForRecruiter(15)).toBe("9+ candidates to review");
  });

  it("returns null when there are none pending", () => {
    expect(suggestionForRecruiter(0)).toBeNull();
  });
});
