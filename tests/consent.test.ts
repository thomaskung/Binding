import { describe, expect, it } from "vitest";
import {
  AGENT_ACCESS_CONSENT_VERSION,
  CONNECTED_ACCOUNTS_CONSENT_VERSION,
  CONSENT_REGISTRY,
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
  it("are five independent consents with their own version strings", () => {
    // Bumping one must never imply re-consent to another (src/lib/consent.ts
    // doc contract) — this asserts they at least exist as distinct exports,
    // so a refactor collapsing them fails loudly. (Some happen to share the
    // same date string because they were drafted the same day — that's a
    // coincidence of value, not shared identity: each is still its own
    // export, bumped independently.)
    const versions = [
      CONSENT_VERSION,
      MARKET_SIGNALS_CONSENT_VERSION,
      MAINTENANCE_CONSENT_VERSION,
      CONNECTED_ACCOUNTS_CONSENT_VERSION,
      AGENT_ACCESS_CONSENT_VERSION,
    ];
    for (const v of versions) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

function findEntry(key: (typeof CONSENT_REGISTRY)[number]["key"]) {
  const entry = CONSENT_REGISTRY.find((e) => e.key === key);
  expect(entry).toBeDefined();
  if (!entry) throw new Error(`missing registry entry for ${key}`);
  return entry;
}

describe("CONSENT_REGISTRY", () => {
  it("has exactly 5 entries, one per exported consent constant", () => {
    expect(CONSENT_REGISTRY).toHaveLength(5);
    const keys = CONSENT_REGISTRY.map((e) => e.key).sort();
    expect(keys).toEqual([
      "agent_access",
      "connected_accounts",
      "core",
      "maintenance",
      "market_signals",
    ]);
  });

  it("each entry's version matches the real exported constant it claims to wrap — so the registry can never silently drift", () => {
    expect(findEntry("core").version).toBe(CONSENT_VERSION);
    expect(findEntry("market_signals").version).toBe(MARKET_SIGNALS_CONSENT_VERSION);
    expect(findEntry("maintenance").version).toBe(MAINTENANCE_CONSENT_VERSION);
    expect(findEntry("connected_accounts").version).toBe(CONNECTED_ACCOUNTS_CONSENT_VERSION);
    expect(findEntry("agent_access").version).toBe(AGENT_ACCESS_CONSENT_VERSION);
  });

  it("roles reflect who each consent is actually gated for (core is both roles; the rest are seeker-only)", () => {
    expect(findEntry("core").roles).toEqual(["seeker", "recruiter"]);
    expect(findEntry("market_signals").roles).toEqual(["seeker"]);
    expect(findEntry("maintenance").roles).toEqual(["seeker"]);
    expect(findEntry("connected_accounts").roles).toEqual(["seeker"]);
    expect(findEntry("agent_access").roles).toEqual(["seeker"]);
  });

  it("the base bundle (tos/processing/profiling) is required and not independently withdrawable", () => {
    const core = CONSENT_REGISTRY.find((e) => e.key === "core");
    expect(core?.required).toBe(true);
    expect(core?.withdrawable).toBe(false);
  });

  it("the other 4 consents are optional and independently withdrawable", () => {
    const rest = CONSENT_REGISTRY.filter((e) => e.key !== "core");
    expect(rest).toHaveLength(4);
    for (const entry of rest) {
      expect(entry.required).toBe(false);
      expect(entry.withdrawable).toBe(true);
    }
  });

  it("timestampColumns/versionColumn line up with the columns actually upserted by the actions", () => {
    // src/app/onboarding/actions.ts activateSeeker()
    expect(findEntry("core").timestampColumns).toEqual([
      "tos_accepted_at",
      "processing_consent_at",
      "profiling_consent_at",
    ]);
    expect(findEntry("core").versionColumn).toBe("consent_version");

    // src/app/(app)/seeker/actions.ts updateMarketSignalsConsent()
    expect(findEntry("market_signals").timestampColumns).toEqual(["market_signals_opt_in_at"]);
    expect(findEntry("market_signals").versionColumn).toBe("market_signals_consent_version");

    // updateMaintenanceConsent()
    expect(findEntry("maintenance").timestampColumns).toEqual(["maintenance_consent_at"]);
    expect(findEntry("maintenance").versionColumn).toBe("maintenance_consent_version");

    // updateConnectedAccountsConsent()
    expect(findEntry("connected_accounts").timestampColumns).toEqual([
      "connected_accounts_opt_in_at",
    ]);
    expect(findEntry("connected_accounts").versionColumn).toBe(
      "connected_accounts_consent_version",
    );
  });
});
