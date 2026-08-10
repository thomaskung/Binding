import { describe, expect, it } from "vitest";
import {
  OVERRIDE_COST,
  OVERRIDE_PREMIUM_REFUND,
  REVEAL_COST,
  revealCostForRank,
  SAME_ROLE_DISCOUNT_MULTIPLIER,
} from "@/lib/points";

describe("same-role reveal discount (rank-based pricing)", () => {
  it("rank 1 always pays the full tiered price, no discount", () => {
    expect(revealCostForRank(REVEAL_COST, 0.5, 1)).toBe(10);
    expect(revealCostForRank(REVEAL_COST, 0.7, 1)).toBe(15);
    expect(revealCostForRank(REVEAL_COST, 0.9, 1)).toBe(20);
  });

  it("rank 2+ applies the 40% discount to the rounded tiered price", () => {
    // baseline tier (multiplier x1): 10 -> discounted 6
    expect(revealCostForRank(REVEAL_COST, 0.5, 2)).toBe(6);
    // strong tier (x1.5): round(10*1.5)=15 -> round(15*0.6)=9
    expect(revealCostForRank(REVEAL_COST, 0.7, 2)).toBe(9);
    // top tier (x2): round(10*2)=20 -> round(20*0.6)=12
    expect(revealCostForRank(REVEAL_COST, 0.9, 2)).toBe(12);
  });

  it("rank 3+ discounts the same as rank 2 (flat discount past the first reveal)", () => {
    expect(revealCostForRank(REVEAL_COST, 0.9, 2)).toBe(revealCostForRank(REVEAL_COST, 0.9, 3));
    expect(revealCostForRank(REVEAL_COST, 0.9, 3)).toBe(revealCostForRank(REVEAL_COST, 0.9, 7));
  });

  it("SAME_ROLE_DISCOUNT_MULTIPLIER is 0.6 (40% off)", () => {
    expect(SAME_ROLE_DISCOUNT_MULTIPLIER).toBe(0.6);
  });

  it("monotonic: for a fixed rank, cost never decreases as score increases", () => {
    for (const rank of [1, 2]) {
      let prev = 0;
      for (const s of [0.4, 0.6, 0.65, 0.75, 0.8, 0.99]) {
        const c = revealCostForRank(REVEAL_COST, s, rank);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });

  it("rank 2+ never costs more than rank 1 for the same score", () => {
    for (const s of [0.5, 0.7, 0.9]) {
      const rank1 = revealCostForRank(REVEAL_COST, s, 1);
      const rank2 = revealCostForRank(REVEAL_COST, s, 2);
      expect(rank2).toBeLessThanOrEqual(rank1);
    }
  });

  it("applies to the override base too", () => {
    expect(revealCostForRank(OVERRIDE_COST, 0.9, 1)).toBe(50);
    // round(50*0.6) = 30
    expect(revealCostForRank(OVERRIDE_COST, 0.9, 2)).toBe(30);
  });

  it("override cost and premium refund stay proportional under discount (kept base + refund = cost)", () => {
    // Mirrors tests/reveal-pricing.test.ts's non-discounted invariant, extended
    // to the discounted (rank 2+) case: two-step rounding (tier then discount)
    // applied independently to the 25/10/15 split must still sum correctly.
    for (const rank of [1, 2]) {
      for (const s of [0.5, 0.7, 0.9]) {
        const cost = revealCostForRank(OVERRIDE_COST, s, rank);
        const refund = revealCostForRank(OVERRIDE_PREMIUM_REFUND, s, rank);
        const keptBase = revealCostForRank(10, s, rank);
        expect(cost).toBe(keptBase + refund);
        expect(refund).toBeLessThan(cost);
      }
    }
  });
});
