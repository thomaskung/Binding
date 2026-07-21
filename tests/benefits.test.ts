import { describe, expect, it } from "vitest";
import { BENEFIT_EARN_EVENTS, BENEFIT_TIER_THRESHOLDS, benefitTier } from "@/lib/benefits";

describe("benefitTier (read-only signal from lifetime EARNED points)", () => {
  it("starts at tier 1 with zero points", () => {
    expect(benefitTier(0)).toBe(1);
  });

  it("reaches tier 2 exactly at its threshold", () => {
    const t2 = BENEFIT_TIER_THRESHOLDS[1]!;
    expect(benefitTier(t2 - 1)).toBe(1);
    expect(benefitTier(t2)).toBe(2);
  });

  it("reaches tier 3 exactly at its threshold", () => {
    const t3 = BENEFIT_TIER_THRESHOLDS[2]!;
    expect(benefitTier(t3 - 1)).toBe(2);
    expect(benefitTier(t3)).toBe(3);
  });

  it("never regresses below tier 1", () => {
    expect(benefitTier(-100)).toBe(1);
  });
});

describe("BENEFIT_EARN_EVENTS (hardening: allowlist, not a denylist)", () => {
  it("excludes partial_refund — a refund of someone else's spend, not new participation", () => {
    expect(BENEFIT_EARN_EVENTS).not.toContain("partial_refund");
  });

  it("excludes any spend/debit event by construction", () => {
    expect(BENEFIT_EARN_EVENTS).not.toContain("reveal_spend");
    expect(BENEFIT_EARN_EVENTS).not.toContain("override_spend");
    expect(BENEFIT_EARN_EVENTS).not.toContain("redemption");
  });

  it("has no notion of a purchase event today — a future one must be added deliberately", () => {
    expect(BENEFIT_EARN_EVENTS.every((e) => !e.includes("purchase"))).toBe(true);
  });
});
