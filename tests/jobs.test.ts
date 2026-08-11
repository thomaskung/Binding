import { describe, expect, it } from "vitest";
import { parseCommaList, parseLineList, relativeDayLabel, salaryDisplay } from "@/lib/jobs";

describe("parseCommaList", () => {
  it("splits, trims, and drops blanks", () => {
    expect(parseCommaList("Node.js, PostgreSQL,  AWS ,")).toEqual([
      "Node.js",
      "PostgreSQL",
      "AWS",
    ]);
  });
  it("empty string yields empty list", () => {
    expect(parseCommaList("")).toEqual([]);
  });
});

describe("parseLineList", () => {
  it("splits on newlines, trims, and drops blanks", () => {
    expect(parseLineList("First line\n\nSecond line\n  Third  ")).toEqual([
      "First line",
      "Second line",
      "Third",
    ]);
  });
});

describe("salaryDisplay", () => {
  it("formats a public range", () => {
    expect(salaryDisplay(180000, 220000, "public")).toBe("$180,000 – $220,000");
  });
  it("hides the range when on_request", () => {
    expect(salaryDisplay(180000, 220000, "on_request")).toBe("Salary on request");
  });
  // The "incomplete range" fallback is deliberately gone: both bounds are
  // NOT NULL since migration 0024, so salaryDisplay takes plain numbers. The
  // null-bounds path for on_request jobs lives at the callers (seeker cards
  // strip the raw range for privacy and render "Salary on request" directly).
});

describe("relativeDayLabel", () => {
  it("labels today, singular day, plural days, and months", () => {
    const now = Date.now();
    expect(relativeDayLabel(new Date(now).toISOString())).toBe("Posted today");
    expect(relativeDayLabel(new Date(now - 86_400_000).toISOString())).toBe("1 day ago");
    expect(relativeDayLabel(new Date(now - 3 * 86_400_000).toISOString())).toBe("3 days ago");
    expect(relativeDayLabel(new Date(now - 40 * 86_400_000).toISOString())).toBe("1 month ago");
    expect(relativeDayLabel(new Date(now - 70 * 86_400_000).toISOString())).toBe("2 months ago");
  });
});
