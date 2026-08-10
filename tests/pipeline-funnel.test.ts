import { describe, it, expect, beforeAll } from "vitest";
import {
  computeAggregateFunnel,
  computeJobFunnel,
  detectStalePostings,
  detectExpiringReveals,
  computePostingMomentum,
  type MatchRow,
  type RevealRequestRow,
} from "@/lib/pipeline-funnel";

describe("pipeline-funnel", () => {
  let now: Date;

  beforeAll(() => {
    now = new Date();
  });

  describe("computeAggregateFunnel", () => {
    it("counts matched, interested, and revealed correctly", () => {
      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: now.toISOString() },
        { job_posting_id: "job1", status: "interested", created_at: now.toISOString() },
        { job_posting_id: "job1", status: "revealed", created_at: now.toISOString() },
        { job_posting_id: "job2", status: "declined", created_at: now.toISOString() },
      ];

      const result = computeAggregateFunnel(matches);

      expect(result.matched).toBe(3); // all except declined
      expect(result.interested).toBe(2); // interested + revealed
      expect(result.revealed).toBe(1); // revealed only
    });

    it("handles empty matches", () => {
      const result = computeAggregateFunnel([]);
      expect(result.matched).toBe(0);
      expect(result.interested).toBe(0);
      expect(result.revealed).toBe(0);
    });
  });

  describe("computeJobFunnel", () => {
    it("returns FunnelStage array with percentages", () => {
      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: now.toISOString() },
        { job_posting_id: "job1", status: "interested", created_at: now.toISOString() },
        { job_posting_id: "job1", status: "revealed", created_at: now.toISOString() },
      ];

      const result = computeJobFunnel(matches);

      expect(result).toHaveLength(3);
      expect(result[0]!.key).toBe("matched");
      expect(result[0]!.value).toBe(3);
      expect(result[0]!.pct).toBe(100);

      expect(result[1]!.key).toBe("interested");
      expect(result[1]!.value).toBe(2);
      expect(result[1]!.pct).toBe(67); // 2/3 * 100

      expect(result[2]!.key).toBe("revealed");
      expect(result[2]!.value).toBe(1);
      expect(result[2]!.pct).toBe(33); // 1/3 * 100
    });

    it("handles zero matched case", () => {
      const result = computeJobFunnel([]);
      expect(result[0]!.pct).toBe(100);
      expect(result[1]!.pct).toBe(0); // 0 interested / 0 matched
      expect(result[2]!.pct).toBe(0);
    });
  });

  describe("detectStalePostings", () => {
    it("identifies postings with no matches in the threshold window", () => {
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: eightDaysAgo.toISOString() },
        { job_posting_id: "job2", status: "surfaced", created_at: twoDaysAgo.toISOString() },
      ];

      const result = detectStalePostings(matches, 7);

      expect(result.has("job1")).toBe(true); // no match in last 7 days
      expect(result.has("job2")).toBe(false); // has match in last 7 days
    });

    it("considers only the latest match per job", () => {
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: tenDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: twoDaysAgo.toISOString() }, // latest
      ];

      const result = detectStalePostings(matches, 7);

      expect(result.has("job1")).toBe(false); // latest is recent
    });

    it("returns empty map if no stale postings", () => {
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: oneDayAgo.toISOString() },
      ];

      const result = detectStalePostings(matches, 7);

      expect(result.size).toBe(0);
    });
  });

  describe("detectExpiringReveals", () => {
    it("identifies override-path reveals nearing 7-day expiry", () => {
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

      const reveals: RevealRequestRow[] = [
        {
          job_posting_id: "job1",
          profile_id: "p1",
          path: "override",
          status: "pending",
          created_at: sixDaysAgo.toISOString(),
        },
        {
          job_posting_id: "job2",
          profile_id: "p2",
          path: "standard",
          status: "pending",
          created_at: sixDaysAgo.toISOString(), // standard has no expiry
        },
        {
          job_posting_id: "job3",
          profile_id: "p3",
          path: "override",
          status: "accepted",
          created_at: sixDaysAgo.toISOString(), // accepted, not pending
        },
        {
          job_posting_id: "job4",
          profile_id: "p4",
          path: "override",
          status: "pending",
          created_at: fourDaysAgo.toISOString(), // not stale enough
        },
      ];

      const result = detectExpiringReveals(reveals);

      expect(result).toHaveLength(1);
      expect(result[0]!.profile_id).toBe("p1");
    });

    it("returns empty array if no expiring reveals", () => {
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const reveals: RevealRequestRow[] = [
        {
          job_posting_id: "job1",
          profile_id: "p1",
          path: "override",
          status: "pending",
          created_at: twoHoursAgo.toISOString(),
        },
      ];

      const result = detectExpiringReveals(reveals);

      expect(result).toHaveLength(0);
    });
  });

  describe("computePostingMomentum", () => {
    it("calculates momentum as delta between this week and last week", () => {
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const nineDaysAgo = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: fifteenDaysAgo.toISOString() }, // older than 14d
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() }, // last week
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() }, // last week
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() }, // this week
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() }, // this week
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() }, // this week
      ];

      const result = computePostingMomentum(matches);

      expect(result.thisWeek).toBe(3);
      expect(result.lastWeek).toBe(2);
      expect(result.delta).toBe(1);
      expect(result.trend).toBe("up");
    });

    it("identifies downward momentum", () => {
      const nineDaysAgo = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() },
      ];

      const result = computePostingMomentum(matches);

      expect(result.thisWeek).toBe(1);
      expect(result.lastWeek).toBe(3);
      expect(result.delta).toBe(-2);
      expect(result.trend).toBe("down");
    });

    it("identifies flat momentum", () => {
      const nineDaysAgo = new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      const matches: MatchRow[] = [
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: nineDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() },
        { job_posting_id: "job1", status: "surfaced", created_at: threeDaysAgo.toISOString() },
      ];

      const result = computePostingMomentum(matches);

      expect(result.thisWeek).toBe(2);
      expect(result.lastWeek).toBe(2);
      expect(result.delta).toBe(0);
      expect(result.trend).toBe("flat");
    });

    it("handles empty matches", () => {
      const result = computePostingMomentum([]);

      expect(result.thisWeek).toBe(0);
      expect(result.lastWeek).toBe(0);
      expect(result.delta).toBe(0);
      expect(result.trend).toBe("flat");
    });
  });
});
