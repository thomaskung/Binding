import { describe, expect, it } from "vitest";
import { EXPERIENCE_CEILING_YEARS, experienceRatio, skillsOverlapRatio } from "@/lib/candidate-scoring";

describe("skillsOverlapRatio", () => {
  it("returns the fraction of job skills the candidate also has", () => {
    expect(skillsOverlapRatio(["React", "SQL", "Go"], ["react", "go"])).toBeCloseTo(2 / 3);
  });

  it("returns 0 when there is no overlap", () => {
    expect(skillsOverlapRatio(["React"], ["Cobol"])).toBe(0);
  });

  it("returns 1 when every job skill is covered", () => {
    expect(skillsOverlapRatio(["React", "SQL"], ["React", "SQL", "Extra"])).toBe(1);
  });

  it("returns 0 when the job lists no skills (nothing to overlap against)", () => {
    expect(skillsOverlapRatio([], ["React"])).toBe(0);
  });

  it("matches case-insensitively and trims whitespace", () => {
    expect(skillsOverlapRatio([" React "], ["react"])).toBe(1);
  });
});

describe("experienceRatio", () => {
  it("scales linearly up to the ceiling", () => {
    expect(experienceRatio(0)).toBe(0);
    expect(experienceRatio(EXPERIENCE_CEILING_YEARS / 2)).toBeCloseTo(0.5);
    expect(experienceRatio(EXPERIENCE_CEILING_YEARS)).toBe(1);
  });

  it("caps at 1 beyond the ceiling", () => {
    expect(experienceRatio(EXPERIENCE_CEILING_YEARS * 2)).toBe(1);
  });

  it("treats null/negative years as 0", () => {
    expect(experienceRatio(null)).toBe(0);
    expect(experienceRatio(-1)).toBe(0);
  });
});
