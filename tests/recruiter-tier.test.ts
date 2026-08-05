import { describe, expect, it } from "vitest";
import { coerceRecruiterTier, recruiterTierLabel, type RecruiterTier } from "@/lib/recruiter-tier";

describe("coerceRecruiterTier", () => {
  it("returns 'free' for null/undefined/empty", () => {
    expect(coerceRecruiterTier(null)).toBe("free");
    expect(coerceRecruiterTier(undefined)).toBe("free");
    expect(coerceRecruiterTier("")).toBe("free");
  });

  it("returns valid values unchanged", () => {
    expect(coerceRecruiterTier("free")).toBe("free");
    expect(coerceRecruiterTier("solo")).toBe("solo");
    expect(coerceRecruiterTier("advanced")).toBe("advanced");
    expect(coerceRecruiterTier("pro_saas")).toBe("pro_saas");
  });

  it("defaults invalid values to 'free'", () => {
    expect(coerceRecruiterTier("garbage")).toBe("free");
    expect(coerceRecruiterTier("PRO")).toBe("free");
  });
});

describe("recruiterTierLabel", () => {
  const labels: Record<RecruiterTier, string> = {
    free: "Free",
    solo: "Solo",
    advanced: "Advanced",
    pro_saas: "Pro SaaS",
  };

  it("returns the correct label for each tier", () => {
    for (const [tier, expected] of Object.entries(labels)) {
      expect(recruiterTierLabel(tier as RecruiterTier)).toBe(expected);
    }
  });
});
