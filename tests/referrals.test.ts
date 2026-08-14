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
    let selectCalls = 0;
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(() => {
            selectCalls++;
            // 1st select: initial check (no code yet). 2nd select: confirm
            // after the update — the newly-generated code stuck.
            return Promise.resolve(
              selectCalls === 1
                ? { data: null, error: null }
                : { data: { invite_code: "new-code" }, error: null },
            );
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    });
    const mock = { from } as any;
    const code = await getOrCreateInviteCode(mock, "p-1");
    expect(code).toBe("new-code");
    expect(selectCalls).toBe(2);
  });

  it("retries after a unique-violation on the update, then succeeds", async () => {
    let selectCalls = 0;
    let updateCalls = 0;
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockImplementation(() => {
            selectCalls++;
            if (selectCalls === 1) return Promise.resolve({ data: null, error: null });
            // Confirm-read after attempt 1's failed update: still no code.
            if (selectCalls === 2) return Promise.resolve({ data: null, error: null });
            // Confirm-read after attempt 2's successful update: code stuck.
            return Promise.resolve({ data: { invite_code: "second-try" }, error: null });
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockImplementation(() => {
            updateCalls++;
            return Promise.resolve(
              updateCalls === 1 ? { error: { code: "23505", message: "duplicate" } } : { error: null },
            );
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
          is: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
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
          is: vi.fn().mockResolvedValue({ error: { code: "42501", message: "no permission" } }),
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
