import { describe, expect, it, vi } from "vitest";
import {
  appendLedger,
  countOverridesToday,
  countStandardRevealsToday,
  earnFreshnessConfirmation,
  expireStaleOverride,
  getBalance,
  InsufficientPointsError,
  isOverrideBlocked,
  seedBalance,
} from "@/lib/points";

describe("InsufficientPointsError", () => {
  it("names the profile, balance and needed amount", () => {
    const err = new InsufficientPointsError("p-1", 5, 10);
    expect(err.message).toContain("p-1");
    expect(err.message).toContain("5");
    expect(err.message).toContain("10");
    expect(err.name).toBe("InsufficientPointsError");
  });
});

describe("getBalance", () => {
  it("returns the stored balance", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { balance: 42 }, error: null });
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) } as any;
    expect(await getBalance(mock, "p-1")).toBe(42);
  });

  it("returns 0 when no balance row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) } as any;
    expect(await getBalance(mock, "p-1")).toBe(0);
  });

  it("throws on lookup error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) } as any;
    await expect(getBalance(mock, "p-1")).rejects.toThrow(/balance lookup failed/);
  });
});

describe("appendLedger", () => {
  it("inserts a credit without a balance check", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const mock = { from: vi.fn().mockReturnValue({ insert }) } as any;
    await appendLedger(mock, { profileId: "p-1", event: "reveal_compensation", amount: 3 });
    expect(insert).toHaveBeenCalledWith({
      profile_id: "p-1",
      event: "reveal_compensation",
      amount: 3,
      reveal_request_id: null,
      note: null,
    });
  });

  it("checks balance before a debit and throws when insufficient", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { balance: 5 }, error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "points_balances") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const mock = { from: fromFn } as any;
    await expect(
      appendLedger(mock, { profileId: "p-1", event: "reveal_spend", amount: -10 }),
    ).rejects.toThrow(/needs 10/);
  });

  it("throws on insert error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "constraint" } });
    const mock = { from: vi.fn().mockReturnValue({ insert }) } as any;
    await expect(
      appendLedger(mock, { profileId: "p-1", event: "seed", amount: 10 }),
    ).rejects.toThrow(/ledger append failed/);
  });
});

describe("seedBalance", () => {
  it("is idempotent — skips when a seed row already exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "x" }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "points_ledger")
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) }) };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    await seedBalance(mock, "p-1", "seeker");
    expect(insert).not.toHaveBeenCalled();
  });

  it("appends a seeker seed when none exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "points_ledger")
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) }),
          insert,
        };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    await seedBalance(mock, "p-1", "seeker");
    const call = insert.mock.calls[0]?.[0];
    expect(call.amount).toBe(10);
    expect(call.note).toContain("seeker activation seed");
  });
});

describe("countStandardRevealsToday", () => {
  it("returns the count of reveal_spend events in the last 24h", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 3, error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte }) }) }),
      }),
    } as any;
    expect(await countStandardRevealsToday(mock, "r-1")).toBe(3);
  });

  it("returns 0 when count is null", async () => {
    const gte = vi.fn().mockResolvedValue({ count: null, error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte }) }) }),
      }),
    } as any;
    expect(await countStandardRevealsToday(mock, "r-1")).toBe(0);
  });
});

describe("countOverridesToday", () => {
  it("returns the count of override_spend events in the last 24h", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 2, error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte }) }) }),
      }),
    } as any;
    expect(await countOverridesToday(mock, "r-1")).toBe(2);
  });
});

describe("isOverrideBlocked", () => {
  it("returns true when a declined override exists in the window", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "x" }], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte: vi.fn().mockReturnValue({ limit }) }) }) }) }) }),
      }),
    } as any;
    expect(await isOverrideBlocked(mock, "r-1", "p-1")).toBe(true);
  });

  it("returns false when no block exists", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte: vi.fn().mockReturnValue({ limit }) }) }) }) }) }),
      }),
    } as any;
    expect(await isOverrideBlocked(mock, "r-1", "p-1")).toBe(false);
  });
});

describe("earnFreshnessConfirmation", () => {
  it("returns false when still within the cooldown window", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "x" }], error: null });
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte: vi.fn().mockReturnValue({ limit }) }) }) }) }),
      }),
    } as any;
    expect(await earnFreshnessConfirmation(mock, "p-1")).toBe(false);
  });

  it("earns points when outside the cooldown", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "points_ledger")
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte: vi.fn().mockReturnValue({ limit }) }) }) }) }),
          insert,
        };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    expect(await earnFreshnessConfirmation(mock, "p-1")).toBe(true);
    const call = insert.mock.calls[0]?.[0];
    expect(call.amount).toBe(3);
    expect(call.note).toBe("freshness confirmation");
  });
});

describe("expireStaleOverride", () => {
  const stale = {
    id: "r-1",
    path: "override" as const,
    status: "pending" as const,
    recruiter_id: "rec-1",
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    refunded: false,
  };

  it("returns false for non-override or non-pending reveals", async () => {
    expect(await expireStaleOverride({} as any, { ...stale, path: "standard" })).toBe(false);
    expect(await expireStaleOverride({} as any, { ...stale, status: "accepted" })).toBe(false);
  });

  it("returns false when the reveal is not yet expired", async () => {
    const fresh = {
      ...stale,
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(await expireStaleOverride({} as any, fresh)).toBe(false);
  });

  it("updates the reveal to declined and refunds the premium", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "reveal_requests") return { update };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    const result = await expireStaleOverride(mock, stale);
    expect(result).toBe(true);
    const refundCall = insert.mock.calls[0]?.[0];
    expect(refundCall.event).toBe("partial_refund");
    expect(refundCall.amount).toBe(15);
  });

  it("does not double-refund when already refunded", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    const insert = vi.fn();
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "reveal_requests") return { update };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    await expireStaleOverride(mock, { ...stale, refunded: true });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("reveal economics constants (relationship invariants)", () => {
  // Constants are tested in reveal-invariants.test.ts. Add env-tunable defaults.
  it("OVERRIDE_REBLOCK_DAYS and OVERRIDE_EXPIRY_DAYS have sensible defaults", async () => {
    const { OVERRIDE_REBLOCK_DAYS, OVERRIDE_EXPIRY_DAYS } = await import("@/lib/points");
    expect(OVERRIDE_REBLOCK_DAYS).toBe(30);
    expect(OVERRIDE_EXPIRY_DAYS).toBe(7);
  });

  it("SEEKER_SEED_POINTS and RECRUITER_SEED_POINTS match the seed.sql", async () => {
    const { RECRUITER_SEED_POINTS, SEEKER_SEED_POINTS } = await import("@/lib/points");
    expect(SEEKER_SEED_POINTS).toBe(10);
    expect(RECRUITER_SEED_POINTS).toBe(100);
  });

  it("FRESHNESS_CONFIRMATION_POINTS is a positive integer under the 90-day cooldown", async () => {
    const { FRESHNESS_CONFIRMATION_COOLDOWN_DAYS, FRESHNESS_CONFIRMATION_POINTS } =
      await import("@/lib/points");
    expect(FRESHNESS_CONFIRMATION_POINTS).toBeGreaterThan(0);
    expect(FRESHNESS_CONFIRMATION_COOLDOWN_DAYS).toBe(90);
  });
});
