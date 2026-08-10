import { describe, expect, it, vi } from "vitest";
import {
  costForSeeker,
  getTrainingCreditBalance,
  getRecentTrainingLedger,
  InsufficientTrainingCreditsError,
  rewardTrainingCompletion,
  spendTrainingCredits,
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

describe("getTrainingCreditBalance", () => {
  it("returns the stored balance", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { balance: 12 }, error: null });
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) } as any;
    expect(await getTrainingCreditBalance(mock, "p-1")).toBe(12);
  });

  it("returns 0 when no row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mock = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) } as any;
    expect(await getTrainingCreditBalance(mock, "p-1")).toBe(0);
  });
});

describe("spendTrainingCredits", () => {
  it("returns early for zero cost (Pro-waived no-op)", async () => {
    const insert = vi.fn();
    const mock = { from: vi.fn().mockReturnValue({ insert }) } as any;
    await spendTrainingCredits(mock, "p-1", "pg-1", 0);
    expect(insert).not.toHaveBeenCalled();
  });

  it("debits the ledger for a non-zero cost", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { balance: 50 }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "training_credit_balances")
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) };
      return { insert };
    });
    const mock = { from: fromFn } as any;
    await spendTrainingCredits(mock, "p-1", "pg-1", 10);
    const call = insert.mock.calls[0]?.[0];
    expect(call.event).toBe("spent");
    expect(call.amount).toBe(-10);
    expect(call.program_id).toBe("pg-1");
  });
});

describe("rewardTrainingCompletion", () => {
  const table = (insert: ReturnType<typeof vi.fn>) => ({
    from: vi.fn().mockReturnValue({ insert }),
  }) as any;

  it("rewards the free tier the standard points amount", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await rewardTrainingCompletion(table(insert), "p-1", "pg-1", "AML Basics", "free");
    const calls = insert.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.event === "earned" && c.amount === TRAINING_COMPLETION_CREDIT_REWARD)).toBe(true);
    expect(calls.some((c) => c.event === "verified_action" && c.amount === TRAINING_COMPLETION_POINTS_REWARD)).toBe(true);
  });

  it("rewards Pro tier at 2x points (accelerated earning)", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await rewardTrainingCompletion(table(insert), "p-1", "pg-1", "AML Basics", "pro");
    const calls = insert.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.event === "verified_action" && c.amount === TRAINING_COMPLETION_POINTS_REWARD * 2)).toBe(true);
  });

  it("defaults to the free-tier rate when tier is omitted", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await rewardTrainingCompletion(table(insert), "p-1", "pg-1", "AML Basics");
    const calls = insert.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.event === "verified_action" && c.amount === TRAINING_COMPLETION_POINTS_REWARD)).toBe(true);
  });
});

describe("getRecentTrainingLedger", () => {
  it("orders entries by recency (most recent first)", async () => {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();

    const limit = vi.fn().mockResolvedValue({
      data: [
        { id: "e-1", event: "earned", amount: 5, note: null, created_at: now },
        { id: "e-2", event: "spent", amount: -20, note: null, created_at: yesterday },
        { id: "e-3", event: "earned", amount: 10, note: null, created_at: twoDaysAgo },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const mock = { from: vi.fn().mockReturnValue({ select }) } as any;

    const result = await getRecentTrainingLedger(mock, "p-1", 3);

    // Verify the query was called with correct order (descending by created_at)
    expect(order.mock.calls[0]?.[0]).toBe("created_at");
    expect(order.mock.calls[0]?.[1]).toEqual({ ascending: false });

    // Verify limit was called with the specified limit
    expect(limit.mock.calls[0]?.[0]).toBe(3);

    // Verify data is returned in the order the mock provided (most recent first)
    expect(result.length).toBe(3);
    expect(result[0]?.amount).toBe(5); // The now entry
    expect(result[1]?.amount).toBe(-20); // The yesterday entry
    expect(result[2]?.amount).toBe(10); // The two days ago entry
  });

  it("respects the limit parameter", async () => {
    const mockData = Array.from({ length: 10 }, (_, i) => ({
      id: `e-${i}`,
      event: "earned",
      amount: 10,
      note: null,
      created_at: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const limit = vi.fn().mockResolvedValue({ data: mockData.slice(0, 3), error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const mock = { from: vi.fn().mockReturnValue({ select }) } as any;

    await getRecentTrainingLedger(mock, "p-1", 3);

    expect(limit.mock.calls[0]?.[0]).toBe(3);
  });

  it("derives label from note when present, otherwise from event", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        { id: "e-1", event: "earned", amount: 10, note: "completed: AML Basics", created_at: new Date().toISOString() },
        { id: "e-2", event: "earned", amount: 5, note: null, created_at: new Date().toISOString() },
        { id: "e-3", event: "spent", amount: -20, note: null, created_at: new Date().toISOString() },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const mock = { from: vi.fn().mockReturnValue({ select }) } as any;

    const result = await getRecentTrainingLedger(mock, "p-1", 3);

    expect(result.length).toBe(3);
    expect(result[0]?.label).toBe("completed: AML Basics");
    expect(result[1]?.label).toBe("Credits earned");
    expect(result[2]?.label).toBe("Program started");
  });

  it("returns empty array when no ledger entries exist", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const mock = { from: vi.fn().mockReturnValue({ select }) } as any;

    const result = await getRecentTrainingLedger(mock, "p-1", 5);

    expect(result).toEqual([]);
  });
});
