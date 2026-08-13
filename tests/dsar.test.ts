import { describe, expect, it } from "vitest";
import { dsarExportGuard, dsarNextAvailableAt } from "@/lib/dsar";

describe("dsarExportGuard — cooldown discipline (mirrors revealSpendGuard)", () => {
  it("allows a first-ever export (never exported before)", () => {
    expect(dsarExportGuard({ lastExportedAt: null, now: new Date(), cooldownDays: 30 })).toBeNull();
  });

  it("blocks an export requested the day after the last one", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    const lastExportedAt = new Date("2026-08-12T00:00:00Z");
    const error = dsarExportGuard({ lastExportedAt, now, cooldownDays: 30 });
    expect(error).toMatch(/once every 30 days/);
  });

  it("allows an export exactly at the cooldown boundary (elapsed === cooldown)", () => {
    const lastExportedAt = new Date("2026-07-14T00:00:00Z");
    const now = new Date(lastExportedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(dsarExportGuard({ lastExportedAt, now, cooldownDays: 30 })).toBeNull();
  });

  it("blocks one millisecond before the cooldown boundary", () => {
    const lastExportedAt = new Date("2026-07-14T00:00:00Z");
    const now = new Date(lastExportedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - 1);
    expect(dsarExportGuard({ lastExportedAt, now, cooldownDays: 30 })).not.toBeNull();
  });

  it("allows well past the cooldown", () => {
    const lastExportedAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-08-13T00:00:00Z");
    expect(dsarExportGuard({ lastExportedAt, now, cooldownDays: 30 })).toBeNull();
  });

  it("includes the next-available date in the error message", () => {
    const lastExportedAt = new Date("2026-08-01T00:00:00Z");
    const now = new Date("2026-08-05T00:00:00Z");
    const error = dsarExportGuard({ lastExportedAt, now, cooldownDays: 30 });
    expect(error).toContain("2026-08-31");
  });
});

describe("dsarNextAvailableAt", () => {
  it("returns null when never exported", () => {
    expect(dsarNextAvailableAt({ lastExportedAt: null, now: new Date(), cooldownDays: 30 })).toBeNull();
  });

  it("returns null once the cooldown has passed", () => {
    const lastExportedAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-08-13T00:00:00Z");
    expect(dsarNextAvailableAt({ lastExportedAt, now, cooldownDays: 30 })).toBeNull();
  });

  it("returns the exact next-available instant while still cooling down", () => {
    const lastExportedAt = new Date("2026-08-01T00:00:00Z");
    const now = new Date("2026-08-05T00:00:00Z");
    const next = dsarNextAvailableAt({ lastExportedAt, now, cooldownDays: 30 });
    expect(next?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});
