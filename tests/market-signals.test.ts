import { describe, expect, it, vi } from "vitest";
import {
  fetchSalaryTrend,
  fetchSalaryTrendBySeniority,
  fetchSkillDemand,
  fetchSkillDemandByLocation,
  suppressBelowCohort,
} from "@/lib/market-signals";

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

describe("fetchSkillDemand (k-anonymized RPC wrapper)", () => {
  it("maps snake_case rows to camelCase", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { skill: "Go", seeker_count: 25, suppressed: false },
        { skill: "Rust", seeker_count: 8, suppressed: true },
      ],
      error: null,
    });
    const rows = await fetchSkillDemand({ rpc } as any, 20);
    expect(rows[0]).toEqual({ skill: "Go", seekerCount: 25, suppressed: false });
    expect(rpc).toHaveBeenCalledWith("market_skill_demand", { p_min_cohort: 20 });
  });

  it("throws on RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(fetchSkillDemand({ rpc } as any)).rejects.toThrow(/market_skill_demand failed/);
  });
});

describe("fetchSalaryTrend", () => {
  it("maps rows and suppresses under threshold", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ desired_role: "Backend", avg_min_salary: 100000, cohort_size: 25, suppressed: false }],
      error: null,
    });
    const rows = await fetchSalaryTrend({ rpc } as any);
    expect(rows[0]).toEqual({ desiredRole: "Backend", avgMinSalary: 100000, cohortSize: 25, suppressed: false });
  });
});

describe("fetchSkillDemandByLocation", () => {
  it("maps skill/region rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ skill: "Go", region: "Hong Kong", seeker_count: 30, suppressed: false }],
      error: null,
    });
    const rows = await fetchSkillDemandByLocation({ rpc } as any);
    expect(rows[0]).toEqual({ skill: "Go", region: "Hong Kong", seekerCount: 30, suppressed: false });
  });
});

describe("fetchSalaryTrendBySeniority", () => {
  it("maps salary-by-seniority rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ desired_role: "Backend", seniority_band: "senior", avg_min_salary: 120000, cohort_size: 22, suppressed: false }],
      error: null,
    });
    const rows = await fetchSalaryTrendBySeniority({ rpc } as any);
    expect(rows[0]).toEqual({
      desiredRole: "Backend",
      seniorityBand: "senior",
      avgMinSalary: 120000,
      cohortSize: 22,
      suppressed: false,
    });
  });
});
