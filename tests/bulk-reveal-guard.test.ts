import { describe, expect, it } from "vitest";
import { assignRevealRanks } from "@/lib/points";

// The daily-cap short-circuit and per-candidate try/catch outcome logic in
// bulkRevealCandidates (src/app/(app)/recruiter/actions.ts) is inline in the
// server action and DB-coupled (admin client, ledger reads) — not extracted
// as a pure function, so it isn't unit-tested here. That path is covered by
// e2e/recruiter-compare-bulk-reveal.spec.ts instead (seeded admin-client
// fixtures, no fake mocking of Supabase).

describe("assignRevealRanks", () => {
  it("sorts by score descending and assigns sequential ranks from startingRank", () => {
    const candidates = [
      { id: "a", score: 0.5 },
      { id: "b", score: 0.9 },
      { id: "c", score: 0.7 },
    ];
    const ranked = assignRevealRanks(candidates, 1);
    expect(ranked.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it("respects a non-1 startingRank (mid-batch continuation)", () => {
    const candidates = [
      { id: "a", score: 0.3 },
      { id: "b", score: 0.8 },
    ];
    const ranked = assignRevealRanks(candidates, 4);
    expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
    expect(ranked.map((c) => c.rank)).toEqual([4, 5]);
  });

  it("is stable for ties (equal scores keep input relative order)", () => {
    const candidates = [
      { id: "a", score: 0.6 },
      { id: "b", score: 0.6 },
      { id: "c", score: 0.6 },
    ];
    const ranked = assignRevealRanks(candidates, 1);
    expect(ranked.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list", () => {
    expect(assignRevealRanks([], 1)).toEqual([]);
  });

  it("preserves extra fields on each candidate", () => {
    const candidates = [{ id: "a", score: 0.5, extra: "keep-me" }];
    const ranked = assignRevealRanks(candidates, 1);
    expect(ranked[0]).toEqual({ id: "a", score: 0.5, extra: "keep-me", rank: 1 });
  });
});
