import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_ATTEMPTS_DAILY_CAP,
  assessmentAttemptCapGuard,
  DUPLICATE_ANSWER_SIMILARITY_THRESHOLD,
} from "@/lib/skill-assessment";

describe("assessmentAttemptCapGuard", () => {
  it("allows the attempt when under cap", () => {
    expect(assessmentAttemptCapGuard(2, 5)).toBeNull();
  });

  it("blocks exactly at cap, not just over it", () => {
    expect(assessmentAttemptCapGuard(5, 5)).toMatch(/daily assessment attempt limit reached/);
  });

  it("blocks over cap", () => {
    expect(assessmentAttemptCapGuard(9, 5)).toMatch(/5\/day/);
  });
});

describe("skill-assessment constants", () => {
  it("ASSESSMENT_ATTEMPTS_DAILY_CAP is a positive integer", () => {
    expect(ASSESSMENT_ATTEMPTS_DAILY_CAP).toBeGreaterThan(0);
    expect(Number.isInteger(ASSESSMENT_ATTEMPTS_DAILY_CAP)).toBe(true);
  });

  it("DUPLICATE_ANSWER_SIMILARITY_THRESHOLD is a near-identical-text-only bar, not a topic-similarity one", () => {
    expect(DUPLICATE_ANSWER_SIMILARITY_THRESHOLD).toBeGreaterThan(0.9);
    expect(DUPLICATE_ANSWER_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
  });
});
