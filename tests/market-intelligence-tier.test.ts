import { describe, expect, it } from "vitest";
import { hasMarketIntelFullAccess } from "@/lib/recruiter-tier";

describe("hasMarketIntelFullAccess", () => {
  it("returns false for the free tier", () => {
    expect(hasMarketIntelFullAccess("free")).toBe(false);
  });

  it("returns false for the solo tier", () => {
    expect(hasMarketIntelFullAccess("solo")).toBe(false);
  });

  it("returns true for the advanced tier", () => {
    expect(hasMarketIntelFullAccess("advanced")).toBe(true);
  });

  it("returns true for the pro_saas tier", () => {
    expect(hasMarketIntelFullAccess("pro_saas")).toBe(true);
  });
});
