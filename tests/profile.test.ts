import { describe, expect, it } from "vitest";
import {
  isQuickActionInstruction,
  isStale,
  PROFILE_QUICK_ACTIONS,
  PROFILE_STALENESS_WINDOW_DAYS,
  regionFromLocation,
} from "@/lib/profile";

describe("regionFromLocation", () => {
  it("drops street-level detail, keeping city + state/zip", () => {
    expect(regionFromLocation("512 Elm St, Austin, TX 78701")).toBe("Austin, TX 78701");
  });

  it("passes through a coarse descriptor unchanged", () => {
    expect(regionFromLocation("Remote / Hybrid")).toBe("Remote / Hybrid");
  });

  it("handles a two-part location as-is", () => {
    expect(regionFromLocation("Austin, TX")).toBe("Austin, TX");
  });
});

describe("isStale", () => {
  const now = new Date("2026-07-21T00:00:00Z");

  it("is not stale with no activity signal at all", () => {
    expect(isStale(null, now)).toBe(false);
  });

  it("is not stale just under the window", () => {
    const recent = new Date(now.getTime() - (PROFILE_STALENESS_WINDOW_DAYS - 1) * 86_400_000);
    expect(isStale(recent.toISOString(), now)).toBe(false);
  });

  it("is stale just past the window", () => {
    const old = new Date(now.getTime() - (PROFILE_STALENESS_WINDOW_DAYS + 1) * 86_400_000);
    expect(isStale(old.toISOString(), now)).toBe(true);
  });
});

describe("PROFILE_QUICK_ACTIONS", () => {
  it("has exactly 3 fixed quick actions", () => {
    expect(PROFILE_QUICK_ACTIONS).toHaveLength(3);
  });

  it("every action has key, label and instruction", () => {
    for (const action of PROFILE_QUICK_ACTIONS) {
      expect(action.key).toBeTruthy();
      expect(action.label).toBeTruthy();
      expect(action.instruction).toBeTruthy();
    }
  });

  it("keys are unique", () => {
    const keys = PROFILE_QUICK_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isQuickActionInstruction", () => {
  it("matches each quick-action instruction exactly", () => {
    for (const action of PROFILE_QUICK_ACTIONS) {
      expect(isQuickActionInstruction(action.instruction)).toBe(true);
    }
  });

  it("rejects unknown instructions", () => {
    expect(isQuickActionInstruction("Make this sound like a pirate")).toBe(false);
    expect(isQuickActionInstruction("")).toBe(false);
    expect(isQuickActionInstruction("more concise")).toBe(false);
  });
});
