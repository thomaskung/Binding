import { describe, expect, it, vi } from "vitest";
import { AI_REFINE_CHAT_DAILY_CAP, countRefineChatCallsToday, logRefineChatCall } from "@/lib/ai-usage";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(),
    }),
  ),
}));

describe("ai-usage (Pro AI chat rate-limiting)", () => {
  it("AI_REFINE_CHAT_DAILY_CAP is a positive integer", () => {
    expect(AI_REFINE_CHAT_DAILY_CAP).toBeGreaterThan(0);
    expect(Number.isInteger(AI_REFINE_CHAT_DAILY_CAP)).toBe(true);
  });

  it("countRefineChatCallsToday queries with a 24h window", async () => {
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        }),
      }),
    };
    const count = await countRefineChatCallsToday(mockAdmin as any, "profile-1");
    expect(count).toBe(3);
  });

  it("countRefineChatCallsToday returns 0 when count is null", async () => {
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: null, error: null }),
          }),
        }),
      }),
    };
    const count = await countRefineChatCallsToday(mockAdmin as any, "profile-1");
    expect(count).toBe(0);
  });

  it("logRefineChatCall inserts a row", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const mockAdmin = { from: vi.fn().mockReturnValue({ insert: insertFn }) };
    await logRefineChatCall(mockAdmin as any, "profile-1");
    expect(insertFn).toHaveBeenCalledWith({
      profile_id: "profile-1",
    });
  });
});
