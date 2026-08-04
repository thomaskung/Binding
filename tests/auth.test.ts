import { describe, expect, it, vi } from "vitest";

function mockSupabase(overrides: {
  userId?: string;
  isSeeker?: boolean;
  isRecruiter?: boolean;
  displayName?: string;
  companyName?: string | null;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: overrides.userId ? { id: overrides.userId } : null },
        error: null,
      })),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn(async () => ({
            data: {
              is_seeker: overrides.isSeeker ?? false,
              is_recruiter: overrides.isRecruiter ?? false,
              display_name: overrides.displayName ?? null,
              company_name: overrides.companyName ?? null,
            },
            error: null,
          })),
        }),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => Promise.resolve(mockSupabase({}))),
  createSupabaseAdminClient: vi.fn(() => Promise.resolve(mockSupabase({}))),
}));

const { getSessionProfile } = await import("@/lib/auth");

describe("getSessionProfile", () => {
  it("returns null when no user is signed in", async () => {
    vi.mocked(await import("@/lib/supabase/server")).createSupabaseServerClient = vi.fn(() =>
      Promise.resolve(mockSupabase({})),
    );
    const result = await getSessionProfile();
    expect(result).toBeNull();
  });

  it("returns a populated session profile for a dual-role onboarded user", async () => {
    vi.mocked(await import("@/lib/supabase/server")).createSupabaseServerClient = vi.fn(() =>
      Promise.resolve(mockSupabase({ userId: "user-1", isSeeker: true, isRecruiter: true, displayName: "Alex", companyName: "Acme" })),
    );
    const session = await getSessionProfile();
    expect(session).toMatchObject({
      userId: "user-1",
      isSeeker: true,
      isRecruiter: true,
      displayName: "Alex",
      companyName: "Acme",
      onboarded: true,
    });
  });

  it("marks onboarded=false when the profile row has no role flags", async () => {
    vi.mocked(await import("@/lib/supabase/server")).createSupabaseServerClient = vi.fn(() =>
      Promise.resolve(mockSupabase({ userId: "u", isSeeker: false, isRecruiter: false })),
    );
    const session = await getSessionProfile();
    expect(session!.onboarded).toBe(false);
  });
});
