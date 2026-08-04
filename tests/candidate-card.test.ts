import { describe, expect, it } from "vitest";
import { candidateLabel, seniorityChip, seniorityTitle, yearsBand } from "@/lib/candidate-card";

describe("candidate-card label helpers", () => {
  it("bands years coarsely (never the exact number)", () => {
    expect(yearsBand(null)).toBeNull();
    expect(yearsBand(0)).toBeNull();
    expect(yearsBand(1)).toBe("<2 yrs");
    expect(yearsBand(3)).toBe("2–5 yrs");
    expect(yearsBand(8)).toBe("5–10 yrs");
    expect(yearsBand(13)).toBe("10+ yrs");
    expect(yearsBand(NaN)).toBeNull();
  });

  it("prefers the desired role, falls back to seniority title, then generic", () => {
    expect(
      candidateLabel({ desiredRoles: ["Senior Backend Engineer"], region: "HK", yearsExperience: 8 }),
    ).toBe("Senior Backend Engineer · HK · 5–10 yrs");
    expect(candidateLabel({ seniorityBand: "staff", region: "Singapore", yearsExperience: 12 })).toBe(
      "Staff · Singapore · 10+ yrs",
    );
    expect(candidateLabel({})).toBe("Candidate");
  });

  it("drops missing segments (no '· null yrs')", () => {
    expect(candidateLabel({ desiredRoles: ["Backend Engineer"], yearsExperience: null })).toBe(
      "Backend Engineer",
    );
    expect(candidateLabel({ seniorityBand: "senior", yearsExperience: 6 })).toBe("Senior · 5–10 yrs");
  });

  it("seniorityTitle + seniorityChip", () => {
    expect(seniorityTitle("mid")).toBe("Mid-level");
    expect(seniorityTitle(null)).toBeNull();
    expect(seniorityChip("senior", 7)).toBe("Senior · 5–10 yrs");
    expect(seniorityChip(null, null)).toBeNull();
  });
});
