import { describe, expect, it, vi } from "vitest";
import { InsufficientPointsError } from "@/lib/points";

describe("InsufficientPointsError", () => {
  it("names the profile, balance and needed amount", () => {
    const err = new InsufficientPointsError("p-1", 5, 10);
    expect(err.message).toContain("p-1");
    expect(err.message).toContain("5");
    expect(err.message).toContain("10");
    expect(err.name).toBe("InsufficientPointsError");
  });
});

describe("reveal economics constants (relationship invariants)", () => {
  // Constants are tested in reveal-invariants.test.ts. Add env-tunable defaults.
  it("OVERRIDE_REBLOCK_DAYS and OVERRIDE_EXPIRY_DAYS have sensible defaults", async () => {
    const { OVERRIDE_REBLOCK_DAYS, OVERRIDE_EXPIRY_DAYS } = await import("@/lib/points");
    expect(OVERRIDE_REBLOCK_DAYS).toBe(30);
    expect(OVERRIDE_EXPIRY_DAYS).toBe(7);
  });

  it("SEEKER_SEED_POINTS and RECRUITER_SEED_POINTS match the seed.sql", async () => {
    const { RECRUITER_SEED_POINTS, SEEKER_SEED_POINTS } = await import("@/lib/points");
    expect(SEEKER_SEED_POINTS).toBe(10);
    expect(RECRUITER_SEED_POINTS).toBe(100);
  });

  it("FRESHNESS_CONFIRMATION_POINTS is a positive integer under the 90-day cooldown", async () => {
    const { FRESHNESS_CONFIRMATION_COOLDOWN_DAYS, FRESHNESS_CONFIRMATION_POINTS } =
      await import("@/lib/points");
    expect(FRESHNESS_CONFIRMATION_POINTS).toBeGreaterThan(0);
    expect(FRESHNESS_CONFIRMATION_COOLDOWN_DAYS).toBe(90);
  });
});
