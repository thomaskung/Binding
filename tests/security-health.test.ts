import { describe, expect, it } from "vitest";
import { computeSecurityHealthFlags } from "@/lib/security-health";

const NOW = new Date("2026-08-13T00:00:00Z");
const CREATED = new Date("2026-01-01T00:00:00Z");

describe("computeSecurityHealthFlags — additional sign-in method", () => {
  it("flags an email-only account", () => {
    const flags = computeSecurityHealthFlags({
      now: NOW,
      accountCreatedAt: CREATED,
      linkedProviders: ["email"],
      emailConfirmedAt: NOW,
    });
    expect(flags.find((f) => f.id === "no-additional-signin")).toBeDefined();
  });

  it("does not flag once an OAuth provider is linked", () => {
    const flags = computeSecurityHealthFlags({
      now: NOW,
      accountCreatedAt: CREATED,
      linkedProviders: ["email", "google"],
      emailConfirmedAt: NOW,
    });
    expect(flags.find((f) => f.id === "no-additional-signin")).toBeUndefined();
  });

  it("flags an empty provider list too (defensive)", () => {
    const flags = computeSecurityHealthFlags({
      now: NOW,
      accountCreatedAt: CREATED,
      linkedProviders: [],
      emailConfirmedAt: NOW,
    });
    expect(flags.find((f) => f.id === "no-additional-signin")).toBeDefined();
  });
});

describe("computeSecurityHealthFlags — email verification", () => {
  it("flags an unverified email", () => {
    const flags = computeSecurityHealthFlags({
      now: NOW,
      accountCreatedAt: CREATED,
      linkedProviders: ["email"],
      emailConfirmedAt: null,
    });
    expect(flags.find((f) => f.id === "email-unverified")).toBeDefined();
  });

  it("does not flag a verified email", () => {
    const flags = computeSecurityHealthFlags({
      now: NOW,
      accountCreatedAt: CREATED,
      linkedProviders: ["email"],
      emailConfirmedAt: NOW,
    });
    expect(flags.find((f) => f.id === "email-unverified")).toBeUndefined();
  });
});
