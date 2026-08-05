import { describe, expect, it, vi } from "vitest";
import {
  costForSeeker,
  getTrainingCreditBalance,
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
