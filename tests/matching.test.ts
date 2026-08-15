import { describe, expect, it, vi } from "vitest";
import {
  findCandidatesForJob,
  HIGH_MATCH_THRESHOLD,
  matchBand,
  MATCH_COSINE_THRESHOLD,
  passesDealbreakers,
  refreshMatchesForJob,
  refreshMatchesForProfile,
  VERIFIED_SKILL_BONUS_CAP,
} from "@/lib/matching";

describe("dealbreaker filter (mirrors match_candidates SQL — keep in sync)", () => {
  const job = { salary_max: 120000, work_setups: ["remote", "hybrid"], offers_equity: false };

  it("passes with no dealbreakers set", () => {
    expect(passesDealbreakers(null, job)).toBe(true);
    expect(passesDealbreakers({}, job)).toBe(true);
  });

  it("fails when job ceiling is below candidate minimum", () => {
    expect(passesDealbreakers({ min_salary: 150000 }, job)).toBe(false);
  });

  it("passes when job ceiling clears candidate minimum", () => {
    expect(passesDealbreakers({ min_salary: 100000 }, job)).toBe(true);
  });

  it("fails when work setups do not overlap", () => {
    expect(passesDealbreakers({ work_setups: ["onsite"] }, job)).toBe(false);
  });

  it("passes on any work-setup overlap", () => {
    expect(passesDealbreakers({ work_setups: ["onsite", "remote"] }, job)).toBe(true);
  });

  it("empty work-setup preference means no constraint", () => {
    expect(passesDealbreakers({ work_setups: [] }, job)).toBe(true);
  });

  it("fails when candidate requires equity but the job does not offer it", () => {
    expect(passesDealbreakers({ equity_required: true }, job)).toBe(false);
    expect(
      passesDealbreakers({ equity_required: true }, { ...job, offers_equity: false }),
    ).toBe(false);
  });

  it("passes when candidate requires equity and the job offers it", () => {
    expect(passesDealbreakers({ equity_required: true }, { ...job, offers_equity: true })).toBe(true);
  });

  it("passes when candidate does not require equity regardless of job offering", () => {
    expect(passesDealbreakers({ equity_required: false }, job)).toBe(true);
    expect(passesDealbreakers({ equity_required: false }, { ...job, offers_equity: true })).toBe(true);
  });
});

describe("matching constants (env-tunable thresholds)", () => {
  it("MATCH_COSINE_THRESHOLD is a positive number ≤ 1", async () => {
    const { MATCH_COSINE_THRESHOLD } = await import("@/lib/matching");
    expect(MATCH_COSINE_THRESHOLD).toBeGreaterThan(0);
    expect(MATCH_COSINE_THRESHOLD).toBeLessThanOrEqual(1);
  });

  it("MATCH_TOP_N is a positive integer", async () => {
    const { MATCH_TOP_N } = await import("@/lib/matching");
    expect(MATCH_TOP_N).toBeGreaterThan(0);
    expect(Number.isInteger(MATCH_TOP_N)).toBe(true);
  });

  it("HIGH_MATCH_THRESHOLD is above the cosine threshold", async () => {
    const { HIGH_MATCH_THRESHOLD, MATCH_COSINE_THRESHOLD } = await import("@/lib/matching");
    expect(HIGH_MATCH_THRESHOLD).toBeGreaterThan(MATCH_COSINE_THRESHOLD);
    expect(HIGH_MATCH_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

describe("matchBand (seeker-facing match-quality gate)", () => {
  it("pro seekers see the true band at every threshold", () => {
    expect(matchBand(0.9, "pro")).toBe("high");
    expect(matchBand(0.85, "pro")).toBe("high");
    expect(matchBand(0.7, "pro")).toBe("normal");
    expect(matchBand(0.55, "pro")).toBe("normal");
    expect(matchBand(0.4, "pro")).toBe("low");
  });

  it("free seekers have the high band capped to normal", () => {
    expect(matchBand(0.95, "free")).toBe("normal");
    expect(matchBand(0.85, "free")).toBe("normal");
  });

  it("free seekers still see normal and low uncapped", () => {
    expect(matchBand(0.7, "free")).toBe("normal");
    expect(matchBand(0.4, "free")).toBe("low");
  });
});

describe("verified-skill bonus invariant (§14b, migration 0033 candidate_score_bonus)", () => {
  it("VERIFIED_SKILL_BONUS_CAP is a small, positive, bounded value", () => {
    // Sanity bound, not a load-bearing number — just guards against a typo
    // turning the cap into something absurd (e.g. 10 instead of 0.10).
    expect(VERIFIED_SKILL_BONUS_CAP).toBeGreaterThan(0);
    expect(VERIFIED_SKILL_BONUS_CAP).toBeLessThan(HIGH_MATCH_THRESHOLD - MATCH_COSINE_THRESHOLD);
  });

  it("a free-tier seeker's visible band stays capped at 'normal' regardless of any bonus-boosted score, up to the maximum possible (1.0)", () => {
    // matchBand doesn't know or care whether its input is raw or
    // bonus-boosted — the free-tier cap is structural (band === "high" &&
    // tier !== "pro" -> "normal"), so this holds by construction. Asserted
    // explicitly anyway: this is exactly the property a future refactor of
    // matchBand or the bonus pipeline could accidentally break, and the
    // bonus's whole job is to move scores toward the boundary this test
    // fuzzes across.
    for (const score of [0.55, 0.7, 0.84, 0.85, 0.9, 0.95, 1.0]) {
      expect(matchBand(score, "free")).not.toBe("high");
    }
  });

  it("a bonus-boosted score CAN cross the high-match boundary for a Pro-tier seeker — a real, accepted signal change, not a leak", () => {
    // Documents the intended behavior (DESIGN.md §14b built-note): a Pro
    // seeker's visible band DOES change based on a verified-skill bonus,
    // same as it already changes based on raw match quality. This is the
    // one seeker-visible differential the bonus can produce — accepted,
    // not a regression to guard against.
    const rawJustBelowHigh = HIGH_MATCH_THRESHOLD - VERIFIED_SKILL_BONUS_CAP / 2;
    expect(matchBand(rawJustBelowHigh, "pro")).toBe("normal");
    expect(matchBand(rawJustBelowHigh + VERIFIED_SKILL_BONUS_CAP, "pro")).toBe("high");
  });
});

describe("findCandidatesForJob", () => {
  it("calls the RPC with threshold and top-n and returns candidates", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { profile_id: "p-1", score: 0.9, redacted_text: "text" },
        { profile_id: "p-2", score: 0.8, redacted_text: "text2" },
      ],
      error: null,
    });
    const mock = { rpc } as any;
    const result = await findCandidatesForJob(mock, "job-1");
    expect(rpc).toHaveBeenCalledWith("match_candidates", {
      p_job_id: "job-1",
      p_threshold: expect.any(Number),
      p_top_n: expect.any(Number),
    });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when data is null", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await findCandidatesForJob({ rpc } as any, "job-1");
    expect(result).toEqual([]);
  });

  it("throws on RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "rpc down" } });
    await expect(findCandidatesForJob({ rpc } as any, "job-1")).rejects.toThrow(/match_candidates failed/);
  });
});

describe("refreshMatchesForJob", () => {
  it("returns 0 when no candidates surface", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const count = await refreshMatchesForJob({ rpc } as any, "job-1");
    expect(count).toBe(0);
  });

  it("upserts surfaced candidates and returns the count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { profile_id: "p-1", score: 0.9 },
        { profile_id: "p-2", score: 0.8 },
      ],
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const mock = {
      rpc,
      from: vi.fn().mockReturnValue({ upsert }),
    } as any;
    const count = await refreshMatchesForJob(mock, "job-1");
    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledWith(
      [
        { job_posting_id: "job-1", profile_id: "p-1", score: 0.9 },
        { job_posting_id: "job-1", profile_id: "p-2", score: 0.8 },
      ],
      { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true },
    );
  });

  it("throws on upsert error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ profile_id: "p-1", score: 0.9 }], error: null });
    const upsert = vi.fn().mockResolvedValue({ error: { message: "constraint" } });
    const mock = { rpc, from: vi.fn().mockReturnValue({ upsert }) } as any;
    await expect(refreshMatchesForJob(mock, "job-1")).rejects.toThrow(/match upsert failed/);
  });
});

describe("refreshMatchesForProfile", () => {
  it("upserts matching jobs for a candidate profile", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { job_posting_id: "j-1", score: 0.9 },
        { job_posting_id: "j-2", score: 0.8 },
      ],
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const mock = { rpc, from: vi.fn().mockReturnValue({ upsert }) } as any;
    const count = await refreshMatchesForProfile(mock, "profile-1");
    expect(count).toBe(2);
    expect(rpc).toHaveBeenCalledWith("match_jobs_for_candidate", {
      p_profile_id: "profile-1",
      p_threshold: expect.any(Number),
      p_top_n: expect.any(Number),
    });
  });

  it("returns 0 when no jobs match", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const count = await refreshMatchesForProfile({ rpc } as any, "profile-1");
    expect(count).toBe(0);
  });
});
