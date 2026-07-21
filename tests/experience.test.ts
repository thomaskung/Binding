import { describe, expect, it } from "vitest";
import { computeExperienceStats, experienceFactsSentence } from "@/lib/experience";

const NOW = new Date("2026-07-20T00:00:00Z");

describe("computeExperienceStats", () => {
  it("returns zeros for no entries", () => {
    expect(computeExperienceStats([], NOW)).toEqual({
      totalYears: 0,
      industryYears: 0,
      dominantIndustry: null,
      avgTenureYears: 0,
    });
  });

  it("a single ongoing role counts up to `now`", () => {
    const stats = computeExperienceStats(
      [{ startDate: "2023-07-20", endDate: null, industry: "Fintech" }],
      NOW,
    );
    expect(stats.totalYears).toBe(3);
    expect(stats.industryYears).toBe(3);
    expect(stats.dominantIndustry).toBe("Fintech");
    expect(stats.avgTenureYears).toBe(3);
  });

  it("non-overlapping roles sum without double counting", () => {
    const stats = computeExperienceStats(
      [
        { startDate: "2016-01-01", endDate: "2019-01-01", industry: "Retail" },
        { startDate: "2020-01-01", endDate: "2023-01-01", industry: "Fintech" },
      ],
      NOW,
    );
    // 3 years + 3 years, 1-year gap not counted.
    expect(stats.totalYears).toBe(6);
    expect(stats.avgTenureYears).toBe(3);
  });

  it("overlapping roles (concurrent jobs) do not double count total years", () => {
    const stats = computeExperienceStats(
      [
        { startDate: "2018-01-01", endDate: "2021-01-01", industry: "Fintech" },
        { startDate: "2019-01-01", endDate: "2020-01-01", industry: "Fintech" }, // fully inside the first
      ],
      NOW,
    );
    expect(stats.totalYears).toBe(3); // merged span is still just 2018-2021
  });

  it("dominant industry is the most recently active role, ties broken by later start", () => {
    const stats = computeExperienceStats(
      [
        { startDate: "2015-01-01", endDate: "2018-01-01", industry: "Retail" },
        { startDate: "2018-01-01", endDate: "2022-01-01", industry: "Fintech" },
        { startDate: "2022-01-01", endDate: null, industry: "Healthtech" },
      ],
      NOW,
    );
    expect(stats.dominantIndustry).toBe("Healthtech");
    expect(stats.industryYears).toBeCloseTo(4.5, 1); // 2022-01-01 to 2026-07-20
  });

  it("entries with no industry are excluded from the industry calc", () => {
    const stats = computeExperienceStats(
      [{ startDate: "2020-01-01", endDate: "2023-01-01", industry: null }],
      NOW,
    );
    expect(stats.dominantIndustry).toBeNull();
    expect(stats.industryYears).toBe(0);
    expect(stats.totalYears).toBe(3);
  });

  it("job-hopping shows low average tenure despite decent total years", () => {
    const stats = computeExperienceStats(
      [
        { startDate: "2024-01-01", endDate: "2024-07-01", industry: "Retail" },
        { startDate: "2024-07-01", endDate: "2025-01-01", industry: "Retail" },
        { startDate: "2025-01-01", endDate: "2025-07-01", industry: "Retail" },
      ],
      NOW,
    );
    expect(stats.avgTenureYears).toBeCloseTo(0.5, 1);
    expect(stats.totalYears).toBeCloseTo(1.5, 1);
  });
});

describe("experienceFactsSentence", () => {
  it("composes a sentence from present signals only", () => {
    const sentence = experienceFactsSentence(
      { totalYears: 8, industryYears: 5, dominantIndustry: "Fintech", avgTenureYears: 3.2 },
      {
        skills: ["Node.js", "PostgreSQL"],
        desiredRoles: ["Staff Engineer"],
        industries: ["Fintech", "Healthtech"],
        referencesAvailable: true,
      },
    );
    expect(sentence).toBe(
      "8 years total experience. 5 years in Fintech. average tenure 3.2 years per role. skills: Node.js, PostgreSQL. seeking roles: Staff Engineer. target industries: Fintech, Healthtech. references available.",
    );
  });

  it("omits absent signals cleanly", () => {
    const sentence = experienceFactsSentence(
      { totalYears: 0, industryYears: 0, dominantIndustry: null, avgTenureYears: 0 },
      { skills: [], desiredRoles: [], industries: [], referencesAvailable: false },
    );
    expect(sentence).toBe("");
  });
});
