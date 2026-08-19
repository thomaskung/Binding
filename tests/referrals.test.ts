import { describe, expect, it, vi } from "vitest";
import { generateInviteCode, getOrCreateInviteCode, resolveReferrerByCode } from "@/lib/referrals";

describe("generateInviteCode", () => {
  it("returns a short, base36 (lowercase alphanumeric) string", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[a-z0-9]+$/);
    expect(code.length).toBeGreaterThan(0);
    expect(code.length).toBeLessThan(16);
  });

  it("is not obviously constant across calls (collision-safe entropy)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    // 48 bits of entropy over 50 draws — collisions would be a near-impossible
    // fluke; a stable/constant generator would collapse this set to size 1.
    expect(codes.size).toBe(50);
  });
});

describe("getOrCreateInviteCode", () => {
  it("returns the existing code without writing anything", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { invite_code: "existing1" }, error: null });
    const update = vi.fn();
    const mock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
        update,
      }),
    } as any;
    expect(await getOrCreateInviteCode(mock, "p-1")).toBe("existing1");
    expect(update).not.toHaveBeenCalled();
  });

  it("generates and persists a new code when none exists", async () => {
    // The write and its confirmation are ONE round trip now
    // (.update().eq().is().select().maybeSingle()) — not a separate re-SELECT
    // (see the doc comment on getOrCreateInviteCode for why: a second,
    // identical SELECT is vulnerable to Next.js Request Memoization silently
    // replaying the pre-write response inside a Server Component render).
    const initialMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { invite_code: "new-code" }, error: null });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: initialMaybeSingle }) }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: updateMaybeSingle }) }),
        }),
      }),
    });
    const mock = { from } as any;
    const code = await getOrCreateInviteCode(mock, "p-1");
    expect(code).toBe("new-code");
    expect(updateMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it("retries after a unique-violation on the update, then succeeds", async () => {
    let updateCalls = 0;
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockImplementation(() => {
            updateCalls++;
            const result =
              updateCalls === 1
                ? { data: null, error: { code: "23505", message: "duplicate" } }
                : { data: { invite_code: "second-try" }, error: null };
            return { select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(result) }) };
          }),
        }),
      }),
    });
    const mock = { from } as any;
    const code = await getOrCreateInviteCode(mock, "p-1");
    expect(code).toBe("second-try");
    expect(updateCalls).toBe(2);
  });

  it("throws after 5 failed attempts", async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } }),
            }),
          }),
        }),
      }),
    });
    const mock = { from } as any;
    await expect(getOrCreateInviteCode(mock, "p-1")).rejects.toThrow(/after 5 attempts/);
  });

  it("throws immediately on a non-unique-violation update error", async () => {
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "no permission" } }),
            }),
          }),
        }),
      }),
    });
    const mock = { from } as any;
    await expect(getOrCreateInviteCode(mock, "p-1")).rejects.toThrow(/invite code generation failed/);
  });
});

describe("resolveReferrerByCode", () => {
  it("returns the referrer's profile id when the code exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "referrer-1" }, error: null });
    const mock = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }),
    } as any;
    expect(await resolveReferrerByCode(mock, "abc")).toBe("referrer-1");
  });

  it("returns null for an unknown code — never distinguishes 'unknown' from an error in its return value", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mock = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }),
    } as any;
    expect(await resolveReferrerByCode(mock, "nope")).toBeNull();
  });

  it("throws on a lookup error", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const mock = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }),
    } as any;
    await expect(resolveReferrerByCode(mock, "abc")).rejects.toThrow(/referrer lookup failed/);
  });
});
