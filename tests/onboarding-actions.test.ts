import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "u-1", email: "test@company.com" } },
        error: null,
      }),
    },
  }) as any),
  createSupabaseAdminClient: vi.fn().mockResolvedValue(({
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }) as any),
}));

vi.mock("@/lib/consent", () => ({
  CONSENT_VERSION: "test-version",
  MAINTENANCE_CONSENT_VERSION: "test-version",
  validateSeekerConsent: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/points", () => ({
  seedBalance: vi.fn().mockResolvedValue(undefined),
  // Referral capture (captureAndEarnReferral in actions.ts) calls this when a
  // referral_code cookie is present — none of these tests set one, so it
  // should never actually be reached, but it must be mocked explicitly:
  // captureAndEarnReferral's try/catch would otherwise silently swallow a
  // "not a function" error from an un-mocked import and this suite would
  // stay green through a real regression.
  earnReferralActivation: vi.fn().mockResolvedValue(false),
}));

describe("activateSeeker", () => {
  it("throws when display name is empty", async () => {
    const { activateSeeker } = await import("@/app/onboarding/actions");
    const fd = new FormData();
    fd.set("display_name", "");
    fd.set("tos", "on");
    fd.set("processing_consent", "on");
    fd.set("profiling_consent", "on");
    await expect(activateSeeker(fd)).rejects.toThrow(/display name required|NEXT_REDIRECT/);
  });
});

describe("activateRecruiter", () => {
  it("throws on consumer email domain (gmail.com)", async () => {
    const { activateRecruiter } = await import("@/app/onboarding/actions");
    const serverMod = await import("@/lib/supabase/server");
    vi.mocked(serverMod.createSupabaseServerClient).mockResolvedValue(({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-2", email: "test@gmail.com" } },
          error: null,
        }),
      },
    }) as any);
    const fd = new FormData();
    fd.set("display_name", "Recruiter");
    fd.set("company_name", "Acme");
    fd.set("tos", "on");
    await expect(activateRecruiter(fd)).rejects.toThrow(/business email|NEXT_REDIRECT/);
  });

  it("throws when company name is empty", async () => {
    const { activateRecruiter } = await import("@/app/onboarding/actions");
    const serverMod = await import("@/lib/supabase/server");
    vi.mocked(serverMod.createSupabaseServerClient).mockResolvedValue(({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-3", email: "test@company.com" } },
          error: null,
        }),
      },
    }) as any);
    const fd = new FormData();
    fd.set("display_name", "Recruiter");
    fd.set("company_name", "");
    fd.set("tos", "on");
    await expect(activateRecruiter(fd)).rejects.toThrow(/company or agency name required|NEXT_REDIRECT/);
  });
});
