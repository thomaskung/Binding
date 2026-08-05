import { describe, expect, it, vi } from "vitest";
import {
  BENEFIT_EARN_EVENTS,
  BENEFIT_SPEND_EVENTS,
  BENEFIT_TIER_THRESHOLDS,
  benefitTier,
  benefitTierProgress,
  getLifetimeBenefitPoints,
  getLifetimeEarnedPoints,
  getLifetimeSpentPoints,
} from "@/lib/benefits";

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

describe("benefitTierProgress (decorative ring, pure derivation)", () => {
  it("starts at 0% fraction into tier 1 at zero points", () => {
    expect(benefitTierProgress(0)).toEqual({ tier: 1, fraction: 0, nextThreshold: BENEFIT_TIER_THRESHOLDS[1] });
  });

  it("reports halfway fraction mid-tier", () => {
    const [t1, t2] = BENEFIT_TIER_THRESHOLDS;
    const midpoint = (t1! + t2!) / 2;
    expect(benefitTierProgress(midpoint).fraction).toBeCloseTo(0.5);
  });

  it("caps fraction at 1 and nextThreshold at null once the top tier is reached", () => {
    const top = BENEFIT_TIER_THRESHOLDS[BENEFIT_TIER_THRESHOLDS.length - 1]!;
    expect(benefitTierProgress(top + 1000)).toEqual({ tier: 3, fraction: 1, nextThreshold: null });
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

describe("BENEFIT_SPEND_EVENTS (recruiter/corporate side — allowlist, not a denylist)", () => {
  it("excludes partial_refund — a refund of the recruiter's own past spend, not new participation", () => {
    expect(BENEFIT_SPEND_EVENTS).not.toContain("partial_refund");
  });

  it("excludes seed — an activation freebie, not participation", () => {
    expect(BENEFIT_SPEND_EVENTS).not.toContain("seed");
  });

  it("excludes any earn-side event by construction", () => {
    expect(BENEFIT_SPEND_EVENTS).not.toContain("reveal_compensation");
    expect(BENEFIT_SPEND_EVENTS).not.toContain("verified_action");
  });

  it("shares no events with the seeker earn-side allowlist", () => {
    const overlap = BENEFIT_SPEND_EVENTS.filter((e) => (BENEFIT_EARN_EVENTS as readonly string[]).includes(e));
    expect(overlap).toHaveLength(0);
  });
});

describe("getLifetimeEarnedPoints (allowlisted earn sum, non-negative)", () => {
  it("sums only positive allowlisted earn events", async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { amount: 3 },   // reveal_compensation
        { amount: 5 },   // verified_action
        { amount: -10 }, // a spend that must NOT count
        { amount: 2 },
      ],
      error: null,
    });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
      }),
    } as any;
    expect(await getLifetimeEarnedPoints(mock, "p-1")).toBe(10);
  });

  it("returns 0 when no rows", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
      }),
    } as any;
    expect(await getLifetimeEarnedPoints(mock, "p-1")).toBe(0);
  });
});

describe("getLifetimeSpentPoints (absolute sum of allowlisted debits)", () => {
  it("sums the absolute value of negative spend events only", async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        { amount: -10 }, // reveal_spend
        { amount: -25 }, // override_spend
        { amount: 5 },   // an earn that must NOT count
        { amount: -15 },
      ],
      error: null,
    });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
      }),
    } as any;
    expect(await getLifetimeSpentPoints(mock, "p-1")).toBe(50);
  });
});

describe("getLifetimeBenefitPoints (per-role routing)", () => {
  it("routes seekers to lifetime earned", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [{ amount: 3 }], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
      }),
    } as any;
    expect(await getLifetimeBenefitPoints(mock, "p-1", "seeker")).toBe(3);
  });

  it("routes recruiters to lifetime spent", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [{ amount: -10 }], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
      }),
    } as any;
    expect(await getLifetimeBenefitPoints(mock, "p-1", "recruiter")).toBe(10);
  });
});
