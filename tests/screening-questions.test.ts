import { describe, expect, it } from "vitest";
import { screeningAnswerCapGuard, SCREENING_ANSWER_DAILY_CAP } from "@/lib/screening-questions";

describe("SCREENING_ANSWER_DAILY_CAP", () => {
  it("is a positive number", () => {
    expect(SCREENING_ANSWER_DAILY_CAP).toBeGreaterThan(0);
  });
});

describe("screeningAnswerCapGuard", () => {
  it("allows a submission under the cap", () => {
    expect(screeningAnswerCapGuard(0, 10)).toBeNull();
    expect(screeningAnswerCapGuard(9, 10)).toBeNull();
  });

  it("blocks at and above the cap (checked before any grading call)", () => {
    expect(screeningAnswerCapGuard(10, 10)).toMatch(/daily screening-answer limit/);
    expect(screeningAnswerCapGuard(11, 10)).toMatch(/daily screening-answer limit/);
  });
});
