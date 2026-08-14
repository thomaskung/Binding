import { describe, expect, it, vi } from "vitest";
import { earnReferralActivation, countReferralPayoutsToday, REFERRAL_DAILY_CAP, REFERRAL_REWARD_POINTS } from "@/lib/points";

/**
 * State-machine tests for the referral activation earn mechanic (DESIGN.md
 * §13g): signed_up -> activated, both parties paid exactly once, a second
 * activation attempt for the same referral is a no-op, and the rate-limit
 * guard's cap-before-earn ordering with the "atomic pair, stays signed_up"
 * behavior pinned (src/lib/points.ts earnReferralActivation doc comment).
 */

/** Builds a minimal admin-client mock for earnReferralActivation:
 * - points_ledger.select (dedupe check): resolves `dedupeExisting`
 * - points_ledger.select (cap count, head:true): resolves `usedToday`
 * - points_ledger.insert: resolves `insertError` (default: no error)
 * - referrals.update: resolves `updateError` (default: no error)
 */
function makeAdmin(opts: {
  dedupeExisting?: boolean;
  usedToday?: number;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const {
    dedupeExisting = false,
    usedToday = 0,
    insertError = null,
    updateError = null,
  } = opts;

  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "points_ledger") {
      return {
        select: vi.fn().mockImplementation((_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
          if (selectOpts?.head) {
            // countReferralPayoutsToday chain: eq -> eq -> like -> gte
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  like: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({ count: usedToday, error: null }),
                  }),
                }),
              }),
            };
          }
          // dedupe chain: eq -> limit
          return {
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: dedupeExisting ? [{ id: "existing-ledger-row" }] : [],
                error: null,
              }),
            }),
          };
        }),
        insert,
      };
    }
    if (table === "referrals") {
      return { update };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from, insert, update } as any;
}

describe("earnReferralActivation", () => {
  it("pays both parties and marks the referral activated (signed_up -> activated)", async () => {
    const admin = makeAdmin({});
    const result = await earnReferralActivation(admin, "referral-1", "referrer-1", "referee-1");
    expect(result).toBe(true);

    expect(admin.insert).toHaveBeenCalledTimes(2);
    const [referrerCall, refereeCall] = admin.insert.mock.calls.map((c: any[]) => c[0]);
    expect(referrerCall).toMatchObject({
      profile_id: "referrer-1",
      event: "verified_action",
      amount: REFERRAL_REWARD_POINTS,
    });
    expect(referrerCall.note).toContain("referral-1");
    expect(referrerCall.note).toContain("referrer");
    expect(refereeCall).toMatchObject({
      profile_id: "referee-1",
      event: "verified_action",
      amount: REFERRAL_REWARD_POINTS,
    });
    expect(refereeCall.note).toContain("referral-1");
    expect(refereeCall.note).toContain("referee");

    expect(admin.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "activated", activated_at: expect.any(String) }),
    );
  });

  it("does not double-pay a referral that's already been activated (dedupe via ledger note)", async () => {
    const admin = makeAdmin({ dedupeExisting: true });
    const result = await earnReferralActivation(admin, "referral-1", "referrer-1", "referee-1");
    expect(result).toBe(false);
    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.update).not.toHaveBeenCalled();
  });

  it("cap checked BEFORE any ledger write: at cap, neither party is paid and the row is not touched", async () => {
    const admin = makeAdmin({ usedToday: REFERRAL_DAILY_CAP });
    const result = await earnReferralActivation(admin, "referral-1", "referrer-1", "referee-1");
    expect(result).toBe(false);
    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.update).not.toHaveBeenCalled();
  });

  it("pays out once the referrer is back under cap (retryable — row can complete on a later call)", async () => {
    const admin = makeAdmin({ usedToday: REFERRAL_DAILY_CAP - 1 });
    const result = await earnReferralActivation(admin, "referral-1", "referrer-1", "referee-1");
    expect(result).toBe(true);
    expect(admin.insert).toHaveBeenCalledTimes(2);
  });

  it("propagates a ledger-append failure without marking the referral activated", async () => {
    const admin = makeAdmin({ insertError: { message: "constraint violation" } });
    await expect(
      earnReferralActivation(admin, "referral-1", "referrer-1", "referee-1"),
    ).rejects.toThrow(/constraint violation|ledger append failed/);
    expect(admin.update).not.toHaveBeenCalled();
  });
});

describe("countReferralPayoutsToday", () => {
  it("returns the referrer-leg payout count in the last 24h", async () => {
    const admin = makeAdmin({ usedToday: 4 });
    expect(await countReferralPayoutsToday(admin, "referrer-1")).toBe(4);
  });
});

describe("referral economics constants", () => {
  it("REFERRAL_REWARD_POINTS and REFERRAL_DAILY_CAP have sensible positive defaults", () => {
    expect(REFERRAL_REWARD_POINTS).toBeGreaterThan(0);
    expect(REFERRAL_DAILY_CAP).toBeGreaterThan(0);
  });
});
