import { describe, expect, it } from "vitest";
import { passesDealbreakers } from "@/lib/matching";

describe("dealbreaker filter (mirrors match_candidates SQL — keep in sync)", () => {
  const job = { salary_max: 120000, work_setups: ["remote", "hybrid"] };

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

  it("passes when the job has no stated ceiling", () => {
    expect(
      passesDealbreakers({ min_salary: 150000 }, { salary_max: null, work_setups: ["remote"] }),
    ).toBe(true);
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
});
