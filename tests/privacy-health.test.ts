import { describe, expect, it } from "vitest";
import {
  CONSENT_STALE_MONTHS,
  computePrivacyHealthFlags,
  type PrivacyHealthInput,
} from "@/lib/privacy-health";

const BASE: PrivacyHealthInput = {
  now: new Date("2026-08-13T00:00:00Z"),
  coreConsentAcceptedAt: new Date("2026-08-01T00:00:00Z"),
  maintenanceConsented: true,
  profileVisibility: "active",
  overrideEnabled: false,
  fieldVisibility: {},
  privacyFieldKeys: ["headline", "location", "skills"],
};

describe("computePrivacyHealthFlags — consent staleness boundary", () => {
  it("does not flag a consent accepted well within the window", () => {
    const flags = computePrivacyHealthFlags(BASE);
    expect(flags.find((f) => f.id === "consent-stale")).toBeUndefined();
  });

  it("flags exactly at the 6-month boundary (boundary itself counts as stale)", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    const exactlySixMonthsAgo = new Date(now);
    exactlySixMonthsAgo.setMonth(exactlySixMonthsAgo.getMonth() - CONSENT_STALE_MONTHS);
    const flags = computePrivacyHealthFlags({
      ...BASE,
      now,
      coreConsentAcceptedAt: exactlySixMonthsAgo,
    });
    expect(flags.find((f) => f.id === "consent-stale")).toBeDefined();
  });

  it("does not flag one day inside the 6-month boundary", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    const almostSixMonthsAgo = new Date(now);
    almostSixMonthsAgo.setMonth(almostSixMonthsAgo.getMonth() - CONSENT_STALE_MONTHS);
    almostSixMonthsAgo.setDate(almostSixMonthsAgo.getDate() + 1);
    const flags = computePrivacyHealthFlags({
      ...BASE,
      now,
      coreConsentAcceptedAt: almostSixMonthsAgo,
    });
    expect(flags.find((f) => f.id === "consent-stale")).toBeUndefined();
  });

  it("flags well past the boundary", () => {
    const flags = computePrivacyHealthFlags({
      ...BASE,
      coreConsentAcceptedAt: new Date("2025-01-01T00:00:00Z"),
    });
    expect(flags.find((f) => f.id === "consent-stale")).toBeDefined();
  });

  it("never flags when consent timestamp is null (recruiter-only accounts don't stamp it)", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, coreConsentAcceptedAt: null });
    expect(flags.find((f) => f.id === "consent-stale")).toBeUndefined();
  });
});

describe("computePrivacyHealthFlags — maintenance off", () => {
  it("flags when maintenance consent is off", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, maintenanceConsented: false });
    expect(flags.find((f) => f.id === "maintenance-off")).toBeDefined();
  });

  it("does not flag when maintenance consent is on", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, maintenanceConsented: true });
    expect(flags.find((f) => f.id === "maintenance-off")).toBeUndefined();
  });
});

describe("computePrivacyHealthFlags — profile paused", () => {
  it("flags a paused profile", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, profileVisibility: "paused" });
    expect(flags.find((f) => f.id === "profile-paused")).toBeDefined();
  });

  it("does not flag an active profile", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, profileVisibility: "active" });
    expect(flags.find((f) => f.id === "profile-paused")).toBeUndefined();
  });
});

describe("computePrivacyHealthFlags — fields fully open", () => {
  it("flags when every tracked field is visible (default/empty map)", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, fieldVisibility: {} });
    expect(flags.find((f) => f.id === "fields-fully-open")).toBeDefined();
  });

  it("does not flag when at least one field is hidden", () => {
    const flags = computePrivacyHealthFlags({
      ...BASE,
      fieldVisibility: { skills: "hidden" },
    });
    expect(flags.find((f) => f.id === "fields-fully-open")).toBeUndefined();
  });

  it("does not flag when the tracked-key list is empty (nothing to be open about)", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, privacyFieldKeys: [] });
    expect(flags.find((f) => f.id === "fields-fully-open")).toBeUndefined();
  });
});

describe("computePrivacyHealthFlags — override enabled", () => {
  it("flags when reveal-override is on", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, overrideEnabled: true });
    expect(flags.find((f) => f.id === "override-enabled")).toBeDefined();
  });

  it("does not flag when reveal-override is off", () => {
    const flags = computePrivacyHealthFlags({ ...BASE, overrideEnabled: false });
    expect(flags.find((f) => f.id === "override-enabled")).toBeUndefined();
  });
});

describe("computePrivacyHealthFlags — combined", () => {
  it("returns all applicable flags at once, none duplicated", () => {
    const flags = computePrivacyHealthFlags({
      now: new Date("2026-08-13T00:00:00Z"),
      coreConsentAcceptedAt: new Date("2025-01-01T00:00:00Z"),
      maintenanceConsented: false,
      profileVisibility: "paused",
      overrideEnabled: true,
      fieldVisibility: {},
      privacyFieldKeys: ["headline", "skills"],
    });
    const ids = flags.map((f) => f.id).sort();
    expect(ids).toEqual(
      [
        "consent-stale",
        "fields-fully-open",
        "maintenance-off",
        "override-enabled",
        "profile-paused",
      ].sort(),
    );
  });

  it("returns no flags for a fully healthy profile", () => {
    const flags = computePrivacyHealthFlags({
      now: new Date("2026-08-13T00:00:00Z"),
      coreConsentAcceptedAt: new Date("2026-08-10T00:00:00Z"),
      maintenanceConsented: true,
      profileVisibility: "active",
      overrideEnabled: false,
      fieldVisibility: { skills: "hidden" },
      privacyFieldKeys: ["headline", "skills"],
    });
    expect(flags).toEqual([]);
  });
});
