import { describe, expect, it } from "vitest";
import {
  coarseSalaryBounds,
  parseCommaList,
  parseLineList,
  relativeDayLabel,
  salaryDisplay,
} from "@/lib/jobs";

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

  describe("band visibility (migration 0025, DESIGN §13a)", () => {
    it("both bounds already on a $20k bucket boundary: displayed as-is", () => {
      expect(salaryDisplay(160000, 200000, "band")).toBe("$160k – $200k");
    });

    it("both bounds off-boundary: min floors down, max ceils up", () => {
      expect(salaryDisplay(182000, 205000, "band")).toBe("$180k – $220k");
    });

    it("min === max, both landing exactly on a bucket boundary: upper bound bumps one bucket up rather than collapsing to a single figure", () => {
      expect(salaryDisplay(180000, 180000, "band")).toBe("$180k – $200k");
    });

    it("a tight true range that stays within a single bucket still widens to a real two-sided band", () => {
      expect(salaryDisplay(161000, 165000, "band")).toBe("$160k – $180k");
    });

    it("a wide true range spanning several buckets: rounds each bound independently", () => {
      expect(salaryDisplay(500000, 650000, "band")).toBe("$500k – $660k");
    });

    it("the 0024 (0, 0) null-backfill sentinel: falls back to 'Salary on request' rather than a fake $0k-ish band", () => {
      expect(salaryDisplay(0, 0, "band")).toBe("Salary on request");
    });
  });
});

describe("coarseSalaryBounds", () => {
  it("rounds off-boundary bounds out to the enclosing bucket", () => {
    expect(coarseSalaryBounds(182000, 205000)).toEqual({ lo: 180000, hi: 220000 });
  });

  it("is idempotent: re-bucketing already-bucketed bounds returns them unchanged", () => {
    const first = coarseSalaryBounds(182000, 205000)!;
    expect(coarseSalaryBounds(first.lo, first.hi)).toEqual(first);
  });

  it("returns null for the 0024 (0, 0) null-backfill sentinel", () => {
    expect(coarseSalaryBounds(0, 0)).toBeNull();
  });
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
