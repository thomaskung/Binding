import { describe, expect, it } from "vitest";
import { relativeTime } from "@/lib/time";

const NOW = Date.parse("2026-08-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 86_400_000;

describe("relativeTime", () => {
  it("returns null for null/blank/unparseable", () => {
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime("", NOW)).toBeNull();
    expect(relativeTime("not-a-date", NOW)).toBeNull();
  });

  it("buckets recent times", () => {
    expect(relativeTime(ago(10 * 60_000), NOW)).toBe("just now"); // <1h
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(1 * DAY), NOW)).toBe("1 day ago");
    expect(relativeTime(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(relativeTime(ago(8 * DAY), NOW)).toBe("1 week ago");
    expect(relativeTime(ago(20 * DAY), NOW)).toBe("2 weeks ago");
  });

  it("handles future timestamps gracefully", () => {
    expect(relativeTime(ago(-5_000), NOW)).toBe("just now");
  });
});
