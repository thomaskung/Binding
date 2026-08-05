import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u-1" } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { seeker_tier: "free", credit_cost: 10, title: "AML Basics" },
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }) as any),
  createSupabaseAdminClient: vi.fn().mockResolvedValue(({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }) as any),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("completeTrainingProgram", () => {
  it("rejects when profile fetch fails", async () => {
    const serverMod = await import("@/lib/supabase/server");
    vi.mocked(serverMod.createSupabaseServerClient).mockResolvedValue(({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "not found" },
            }),
          }),
        }),
      }),
    }) as any);
    const { completeTrainingProgram } = await import("@/app/(app)/training/actions");
    await expect(completeTrainingProgram("bad-id")).rejects.toThrow();
  });
});
