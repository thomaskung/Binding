import { describe, expect, it } from "vitest";
import {
  OVERRIDE_COMPENSATION,
  OVERRIDE_COST,
  OVERRIDE_DAILY_CAP,
  OVERRIDE_PREMIUM_REFUND,
  REVEAL_COMPENSATION,
  REVEAL_COST,
  REVEAL_DAILY_CAP,
  revealSpendGuard,
} from "@/lib/points";

/**
 * Guard-set invariants for the reveal economy (DESIGN.md §4/§5). The reveal
 * actions run on the admin client (service role bypasses RLS), so these
 * invariants live in app code — this suite is the CI tripwire that a
 * refactor can't silently drop one (plan decision 2026-07-28: accept the
 * admin-client pattern + test the guards, defer the definer-RPC migration).
 */

describe("revealSpendGuard — cap before balance, deterministic error ordering", () => {
  it("allows a spend under both limits", () => {
    expect(
      revealSpendGuard({ usedToday: 0, dailyCap: 10, balance: 100, cost: 10, kind: "reveal" }),
    ).toBeNull();
  });

  it("blocks at the cap even with plenty of balance", () => {
    expect(
      revealSpendGuard({ usedToday: 10, dailyCap: 10, balance: 1000, cost: 10, kind: "reveal" }),
    ).toBe("daily reveal limit reached (10/day)");
  });

  it("blocks on insufficient balance under the cap", () => {
    expect(
      revealSpendGuard({ usedToday: 0, dailyCap: 10, balance: 5, cost: 10, kind: "reveal" }),
    ).toBe("insufficient points (5/10)");
  });

  it("reports the CAP error when both limits are hit — ordering is the contract", () => {
    const error = revealSpendGuard({
      usedToday: 10,
      dailyCap: 10,
      balance: 0,
      cost: 10,
      kind: "reveal",
    });
    expect(error).toMatch(/daily reveal limit/);
    expect(error).not.toMatch(/insufficient/);
  });

  it("override variant keeps the top-ups hint on the balance error", () => {
    expect(
      revealSpendGuard({ usedToday: 0, dailyCap: 5, balance: 10, cost: 25, kind: "override" }),
    ).toMatch(/top-ups are coming soon/);
    expect(
      revealSpendGuard({ usedToday: 5, dailyCap: 5, balance: 100, cost: 25, kind: "override" }),
    ).toBe("daily override limit reached (5/day)");
  });
});

describe("reveal economics constants (placeholder values, relationships are load-bearing)", () => {
  it("override cost = standard base + premium (the decline refund returns only the premium)", () => {
    expect(OVERRIDE_COST).toBe(REVEAL_COST + OVERRIDE_PREMIUM_REFUND);
  });

  it("override compensation exceeds standard — bigger privacy cost pays more", () => {
    expect(OVERRIDE_COMPENSATION).toBeGreaterThan(REVEAL_COMPENSATION);
  });

  it("both reveal paths carry a daily cap (DESIGN §5 rate-limited-reveals mitigation)", () => {
    expect(REVEAL_DAILY_CAP).toBeGreaterThan(0);
    expect(OVERRIDE_DAILY_CAP).toBeGreaterThan(0);
    // Standard cap binds at the affordable burst under seed economics
    // (100-pt seed / 10-pt reveal): a cap above that would be decorative
    // until top-ups ship.
    expect(REVEAL_DAILY_CAP * REVEAL_COST).toBeLessThanOrEqual(100);
  });
});
