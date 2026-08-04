import { describe, expect, it } from "vitest";
import { computeExperienceStats, normalizeExperienceDates, seniorityBand } from "@/lib/experience";

const NOW = new Date("2026-08-04T00:00:00Z");

describe("normalizeExperienceDates + defensive stats (G2)", () => {
  it("coerces 'Present' / YYYY-MM extractor output to a clean 13-year timeline (not NaN/junior)", () => {
    // The exact shape the founder-resume test fed raw /extract output in with.
    const raw = [
      { startDate: "2022-11", endDate: "Present", industry: "digital asset custody" },
      { startDate: "2018-06", endDate: "2022-08", industry: "fintech" },
      { startDate: "2016-11", endDate: "2018-06", industry: "information technology" },
      { startDate: "2012-06", endDate: "2016-10", industry: "information technology" },
    ];
    const normalized = normalizeExperienceDates(raw);
    expect(normalized[0]!.endDate).toBeNull(); // "Present" -> null
    expect(normalized[0]!.startDate).toBe("2022-11-01"); // YYYY-MM padded

    const stats = computeExperienceStats(normalized, NOW);
    expect(Number.isNaN(stats.totalYears)).toBe(false);
    expect(stats.totalYears).toBeGreaterThan(12); // ~14 years merged
    expect(seniorityBand(stats.totalYears)).not.toBe("junior");
    expect(["senior", "staff", "executive"]).toContain(seniorityBand(stats.totalYears));
    expect(stats.dominantIndustry).toBe("digital asset custody");
  });

  it("drops entries with an unparseable start date rather than poisoning the merge", () => {
    const normalized = normalizeExperienceDates([
      { startDate: "garbage", endDate: null, industry: "x" },
      { startDate: "2020-01", endDate: "2024-01", industry: "fintech" },
    ]);
    expect(normalized).toHaveLength(1);
    const stats = computeExperienceStats(normalized, NOW);
    expect(stats.totalYears).toBeCloseTo(4, 0);
  });

  it("computeExperienceStats is defensive even if a raw 'Present' slips past the normalizer", () => {
    const stats = computeExperienceStats(
      [{ startDate: "2019-01-01", endDate: "Present", industry: "fintech" }],
      NOW,
    );
    expect(Number.isNaN(stats.totalYears)).toBe(false);
    expect(stats.totalYears).toBeGreaterThan(6); // 'Present' treated as ongoing = now
  });
});
