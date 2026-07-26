import { describe, expect, it } from "vitest";
import { costForSeeker } from "@/lib/training";

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
