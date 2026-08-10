/**
 * Recruiter pipeline funnel calculations — shared across the Pipeline
 * command-center and the Jobs postings list.
 *
 * All functions are pure and unit-testable.
 */

export interface MatchRow {
  job_posting_id: string;
  status: "surfaced" | "interested" | "declined" | "revealed";
  created_at: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  pct: number;
}

/**
 * Aggregate funnel counts across all matches.
 * Stages: Matched → Interested → Revealed
 *
 * Matched = status !== "declined"
 * Interested = status === "interested" || status === "revealed"
 * Revealed = status === "revealed"
 *
 * Note: Computed from PostgREST row-fetch (no SQL GROUP BY available);
 * this is a single query, one source of truth (not summed per-posting).
 */
export function computeAggregateFunnel(matches: MatchRow[]): {
  matched: number;
  interested: number;
  revealed: number;
} {
  const matched = matches.filter((m) => m.status !== "declined").length;
  const interested = matches.filter(
    (m) => m.status === "interested" || m.status === "revealed"
  ).length;
  const revealed = matches.filter((m) => m.status === "revealed").length;
  return { matched, interested, revealed };
}

/**
 * Funnel for a single job (used by jobs/page.tsx).
 * Returns three FunnelStage objects: matched, interested, revealed.
 */
export function computeJobFunnel(matches: MatchRow[]): FunnelStage[] {
  const { matched, interested, revealed } = computeAggregateFunnel(matches);
  const pct = (n: number) => (matched === 0 ? 0 : Math.round((n / matched) * 100));
  return [
    { key: "matched", label: "Matched", value: matched, pct: 100 },
    {
      key: "interested",
      label: "Interested",
      value: interested,
      pct: pct(interested),
    },
    {
      key: "revealed",
      label: "Revealed",
      value: revealed,
      pct: pct(revealed),
    },
  ];
}

/**
 * Detect stale postings: those with no new matches in the threshold window.
 * Uses MAX(created_at) per posting because created_at is stable across
 * upserts (ignoreDuplicates: true in matching.ts), making it the reliable
 * "when was the last new candidate found?" timestamp.
 *
 * @param matches All matches for this recruiter's jobs
 * @param thresholdDays How old to consider "stale" (default: 7)
 * @returns Map of job_posting_id -> oldest-match created_at, for those stale
 */
export function detectStalePostings(
  matches: MatchRow[],
  thresholdDays: number = 7
): Map<string, string> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);

  const lastMatchByJob = new Map<string, Date>();
  for (const match of matches) {
    const createdAt = new Date(match.created_at);
    const current = lastMatchByJob.get(match.job_posting_id);
    if (!current || createdAt > current) {
      lastMatchByJob.set(match.job_posting_id, createdAt);
    }
  }

  const stale = new Map<string, string>();
  for (const [jobId, lastMatchDate] of lastMatchByJob) {
    if (lastMatchDate < staleThreshold) {
      stale.set(jobId, lastMatchDate.toISOString());
    }
  }
  return stale;
}

export interface RevealRequestRow {
  job_posting_id: string;
  profile_id: string;
  path: "standard" | "override";
  status: "pending" | "accepted" | "declined";
  created_at: string;
}

/**
 * Detect overrides nearing expiry: override-path reveals pending for >5 days
 * (within 2 days of the 7-day expiry window).
 *
 * Only override-path reveals have a 7-day expiry; standard-path reveals have
 * no expiry in this system. Read-only: this is for alerting, not triggering expiry.
 *
 * @param reveals All reveal requests for this recruiter's jobs
 * @returns Array of nearing-expiry reveal requests
 */
export function daysUntilOverrideExpiry(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, 7 - Math.floor(ageMs / (24 * 60 * 60 * 1000)));
}

export function detectExpiringReveals(reveals: RevealRequestRow[]): RevealRequestRow[] {
  // 7-day window, but alert within 2 days = created more than 5 days ago
  const now = new Date();
  const nearExpiryThreshold = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  return reveals.filter(
    (r) =>
      r.path === "override" &&
      r.status === "pending" &&
      new Date(r.created_at) < nearExpiryThreshold
  );
}

/**
 * Momentum for a single posting: match-count delta between this week and last.
 * Useful for understanding if a posting is getting fresh traction.
 *
 * @param matches All matches for this job
 * @returns { thisWeek, lastWeek, delta, trend: 'up' | 'down' | 'flat' }
 */
export function computePostingMomentum(matches: MatchRow[]): {
  thisWeek: number;
  lastWeek: number;
  delta: number;
  trend: "up" | "down" | "flat";
} {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeek = matches.filter(
    (m) => new Date(m.created_at) >= sevenDaysAgo
  ).length;
  const lastWeek = matches.filter(
    (m) =>
      new Date(m.created_at) >= fourteenDaysAgo &&
      new Date(m.created_at) < sevenDaysAgo
  ).length;
  const delta = thisWeek - lastWeek;

  return {
    thisWeek,
    lastWeek,
    delta,
    trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
}
