import { describe, expect, it } from "vitest";
import { resolveIntent, resolveOnboardingRedirect } from "@/lib/signup-intent";

describe("resolveIntent", () => {
  it("accepts the two valid roles", () => {
    expect(resolveIntent("seeker")).toBe("seeker");
    expect(resolveIntent("recruiter")).toBe("recruiter");
  });

  it("rejects garbage instead of guessing a role", () => {
    expect(resolveIntent("admin")).toBeNull();
    expect(resolveIntent("SEEKER")).toBeNull();
    expect(resolveIntent("seeker%20")).toBeNull();
    expect(resolveIntent("")).toBeNull();
    expect(resolveIntent(null)).toBeNull();
    expect(resolveIntent(undefined)).toBeNull();
  });
});

describe("resolveOnboardingRedirect (intent wins over onboarded)", () => {
  const seekerOnly = { isSeeker: true, isRecruiter: false, onboarded: true };
  const recruiterOnly = { isSeeker: false, isRecruiter: true, onboarded: true };
  const dual = { isSeeker: true, isRecruiter: true, onboarded: true };
  const fresh = { isSeeker: false, isRecruiter: false, onboarded: false };

  it("routes intent for a role NOT held to that role's activation — even when already onboarded (the bug-fix case)", () => {
    expect(resolveOnboardingRedirect(seekerOnly, "recruiter")).toBe("/onboarding/recruiter");
    expect(resolveOnboardingRedirect(recruiterOnly, "seeker")).toBe("/onboarding/seeker");
    expect(resolveOnboardingRedirect(fresh, "seeker")).toBe("/onboarding/seeker");
    expect(resolveOnboardingRedirect(fresh, "recruiter")).toBe("/onboarding/recruiter");
  });

  it("routes intent for a role already held to that role's dashboard", () => {
    expect(resolveOnboardingRedirect(seekerOnly, "seeker")).toBe("/seeker");
    expect(resolveOnboardingRedirect(dual, "recruiter")).toBe("/recruiter");
  });

  it("falls back to the primary dashboard when onboarded with no intent", () => {
    expect(resolveOnboardingRedirect(seekerOnly, null)).toBe("/seeker");
    expect(resolveOnboardingRedirect(recruiterOnly, null)).toBe("/recruiter");
    expect(resolveOnboardingRedirect(dual, null)).toBe("/seeker");
  });

  it("returns null (show the chooser) when not onboarded and no intent", () => {
    expect(resolveOnboardingRedirect(fresh, null)).toBeNull();
  });
});
