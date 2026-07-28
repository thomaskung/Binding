import { describe, expect, it } from "vitest";
import {
  CONSENT_VERSION,
  MAINTENANCE_CONSENT_VERSION,
  MARKET_SIGNALS_CONSENT_VERSION,
  validateSeekerConsent,
} from "@/lib/consent";

describe("validateSeekerConsent", () => {
  it("passes with the two required consents + ToS (maintenance not required)", () => {
    expect(validateSeekerConsent({ tos: true, processing: true, profiling: true })).toBeNull();
  });

  it("rejects missing ToS", () => {
    expect(validateSeekerConsent({ tos: false, processing: true, profiling: true })).toMatch(
      /terms/,
    );
  });

  it("rejects missing processing consent", () => {
    expect(validateSeekerConsent({ tos: true, processing: false, profiling: true })).toMatch(
      /required/,
    );
  });

  it("rejects missing profiling consent — automated matching needs its own notice (Q14)", () => {
    expect(validateSeekerConsent({ tos: true, processing: true, profiling: false })).toMatch(
      /required/,
    );
  });
});

describe("consent versions", () => {
  it("are three independent consents with their own version strings", () => {
    // Bumping one must never imply re-consent to another (src/lib/consent.ts
    // doc contract) — this asserts they at least exist as distinct exports,
    // so a refactor collapsing them fails loudly.
    const versions = [CONSENT_VERSION, MARKET_SIGNALS_CONSENT_VERSION, MAINTENANCE_CONSENT_VERSION];
    for (const v of versions) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
