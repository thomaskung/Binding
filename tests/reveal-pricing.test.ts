import { describe, expect, it } from "vitest";
import { matchPriceMultiplier, OVERRIDE_COST, REVEAL_COST, revealCostForScore } from "@/lib/points";

describe("match-quality reveal pricing (§4a)", () => {
  it("multiplier rises with match score", () => {
    expect(matchPriceMultiplier(0.5)).toBe(1);
    expect(matchPriceMultiplier(0.64)).toBe(1);
    expect(matchPriceMultiplier(0.65)).toBe(1.5);
    expect(matchPriceMultiplier(0.79)).toBe(1.5);
    expect(matchPriceMultiplier(0.8)).toBe(2);
    expect(matchPriceMultiplier(0.95)).toBe(2);
  });

  it("scales the standard reveal cost by band — a stronger match costs more", () => {
    expect(revealCostForScore(REVEAL_COST, 0.5)).toBe(10);
    expect(revealCostForScore(REVEAL_COST, 0.72)).toBe(15);
    expect(revealCostForScore(REVEAL_COST, 0.9)).toBe(20);
  });

  it("monotonic: cost never decreases as score increases", () => {
    let prev = 0;
    for (const s of [0.4, 0.6, 0.65, 0.75, 0.8, 0.99]) {
      const c = revealCostForScore(REVEAL_COST, s);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("applies to the override base too", () => {
    expect(revealCostForScore(OVERRIDE_COST, 0.9)).toBe(50);
  });
});
