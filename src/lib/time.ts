/**
 * Relative-time formatting for the recruiter card's "declared interest" line
 * (founder obs #4: recent <1 day / 1 day / 2 days / 1 week …). Coarse buckets,
 * not exact — recruiters want recency, not a timestamp. Pure; tests in
 * tests/time.test.ts.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Human relative time for an ISO timestamp (or null). `now` is injectable for
 * deterministic tests. Returns null for a null/blank/unparseable input so the
 * caller can render a "not yet interested" placeholder. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = now - then;
  if (diff < 0) return "just now";
  if (diff < HOUR) return "just now";
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return h <= 1 ? "1 hour ago" : `${h} hours ago`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return d <= 1 ? "1 day ago" : `${d} days ago`;
  }
  if (diff < 5 * WEEK) {
    const w = Math.floor(diff / WEEK);
    return w <= 1 ? "1 week ago" : `${w} weeks ago`;
  }
  const months = Math.floor(diff / (30 * DAY));
  if (months < 12) return months <= 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(diff / (365 * DAY));
  return years <= 1 ? "1 year ago" : `${years} years ago`;
}
