import { describe, expect, it } from "vitest";
import {
  costForSeeker,
  InsufficientTrainingCreditsError,
  TRAINING_COMPLETION_CREDIT_REWARD,
  TRAINING_COMPLETION_POINTS_REWARD,
} from "@/lib/training";

describe("costForSeeker (Pro-waived cost branch)", () => {
  it("charges the free tier the full listed cost", () => {
    expect(costForSeeker(40, "free")).toBe(40);
  });

  it("waives the cost entirely for Pro subscribers", () => {
    expect(costForSeeker(40, "pro")).toBe(0);
  });

  it("a free program costs nothing for either tier", () => {
    expect(costForSeeker(0, "free")).toBe(0);
    expect(costForSeeker(0, "pro")).toBe(0);
  });
});

describe("training constants", () => {
  it("TRAINING_COMPLETION_CREDIT_REWARD is a positive integer", () => {
    expect(TRAINING_COMPLETION_CREDIT_REWARD).toBeGreaterThan(0);
    expect(Number.isInteger(TRAINING_COMPLETION_CREDIT_REWARD)).toBe(true);
  });

  it("TRAINING_COMPLETION_POINTS_REWARD is a positive integer", () => {
    expect(TRAINING_COMPLETION_POINTS_REWARD).toBeGreaterThan(0);
    expect(Number.isInteger(TRAINING_COMPLETION_POINTS_REWARD)).toBe(true);
  });
});

describe("InsufficientTrainingCreditsError", () => {
  it("includes the profile ID, balance and required credits", () => {
    const err = new InsufficientTrainingCreditsError("p-1", 5, 10);
    expect(err.message).toContain("p-1");
    expect(err.message).toContain("5");
    expect(err.message).toContain("10");
    expect(err.name).toBe("InsufficientTrainingCreditsError");
  });
});
