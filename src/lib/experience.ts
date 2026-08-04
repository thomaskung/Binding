/** Derives aggregate, non-identifying matching signals from a seeker's
 * structured work history — never the raw entries themselves (those stay
 * owner-only; see supabase/migrations/0008 and RLS). These derived facts
 * are what gets blended into the match embedding (src/app/seeker/actions.ts
 * publishProfile()).
 *
 * "Reputation of last employer" was deliberately replaced with tenure/
 * stability (years-per-role) — an objective signal, rather than a
 * subjective employer-prestige score that risks favoring big/famous
 * companies over equally-qualified candidates from smaller ones. */

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export interface ExperienceEntry {
  startDate: string; // ISO date
  endDate: string | null; // null = present / ongoing
  industry: string | null;
}

// Tokens the LLM extractor emits for an ongoing role instead of the null the
// prompt asks for (Qwen3 is inconsistent). Treated as "no end date" = present.
const PRESENT_TOKENS = new Set(["present", "current", "now", "ongoing", "présent", "till date", "to date"]);

/** Parse a loose date string into epoch ms, or null if unparseable. Accepts
 * ISO, `YYYY` and `YYYY-MM` (padded to the 1st), which is what the LLM
 * extractor and hand-authored seed data actually produce. Pure. */
export function parseFlexibleDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  if (!s || PRESENT_TOKENS.has(s.toLowerCase())) return null;
  let iso = s;
  if (/^\d{4}$/.test(s)) iso = `${s}-01-01`;
  else if (/^\d{4}-\d{2}$/.test(s)) iso = `${s}-01`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Defensive normalizer for extractor/seed-derived work history before it
 * reaches computeExperienceStats: coerces `"Present"`/blank/unparseable end
 * dates to null and drops any entry whose START date can't be parsed (a NaN
 * start would otherwise poison the interval merge — the exact bug the founder
 * resume test surfaced when raw /extract output was fed in directly). In
 * production computeExperienceStats gets clean `date`-typed rows from
 * seeker_experience; this is defense-in-depth + the path the test harness
 * and seed data go through. Pure. */
export function normalizeExperienceDates(
  entries: { startDate: string | null; endDate: string | null; industry: string | null }[],
): ExperienceEntry[] {
  const out: ExperienceEntry[] = [];
  for (const e of entries) {
    const start = parseFlexibleDate(e.startDate);
    if (start === null) continue; // unparseable start → drop (can't place on timeline)
    const end = parseFlexibleDate(e.endDate); // null = present / ongoing
    out.push({
      startDate: new Date(start).toISOString().slice(0, 10),
      endDate: end === null ? null : new Date(end).toISOString().slice(0, 10),
      industry: e.industry,
    });
  }
  return out;
}

export interface ExperienceStats {
  totalYears: number;
  industryYears: number;
  dominantIndustry: string | null;
  avgTenureYears: number;
}

function toRange(entry: ExperienceEntry, now: Date): [number, number] | null {
  const start = parseFlexibleDate(entry.startDate);
  if (start === null) return null; // defensive: an unparseable start can't be placed
  const end = parseFlexibleDate(entry.endDate) ?? now.getTime(); // null/blank = ongoing
  return [start, Math.max(start, end)];
}

/** Sum of merged (non-overlapping) interval durations, in years. */
function mergedYears(ranges: [number, number][]): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let totalMs = 0;
  let [curStart, curEnd] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]!;
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      totalMs += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  totalMs += curEnd - curStart;
  return totalMs / YEAR_MS;
}

export function computeExperienceStats(
  entries: ExperienceEntry[],
  now: Date = new Date(),
): ExperienceStats {
  const withRanges = entries
    .map((e) => ({ ...e, range: toRange(e, now) }))
    .filter((e): e is typeof e & { range: [number, number] } => e.range !== null);

  if (withRanges.length === 0) {
    return { totalYears: 0, industryYears: 0, dominantIndustry: null, avgTenureYears: 0 };
  }

  const totalYears = mergedYears(withRanges.map((e) => e.range));
  const avgTenureYears =
    withRanges.reduce((sum, e) => sum + (e.range[1] - e.range[0]) / YEAR_MS, 0) / withRanges.length;

  // Dominant industry = the one attached to the most recently active role
  // (latest end date, ties broken by latest start date) — "current industry".
  const withIndustry = withRanges.filter((e) => e.industry);
  const dominantIndustry =
    withIndustry.length === 0
      ? null
      : [...withIndustry].sort((a, b) => b.range[1] - a.range[1] || b.range[0] - a.range[0])[0]!
          .industry;

  const industryYears = dominantIndustry
    ? mergedYears(withRanges.filter((e) => e.industry === dominantIndustry).map((e) => e.range))
    : 0;

  return {
    totalYears: Math.round(totalYears * 10) / 10,
    industryYears: Math.round(industryYears * 10) / 10,
    dominantIndustry,
    avgTenureYears: Math.round(avgTenureYears * 10) / 10,
  };
}

export type SeniorityBand = "junior" | "mid" | "senior" | "staff" | "executive";

/** Buckets total years of experience into the market-intel seniority
 * breakdown (Phase 3B). Boundaries belong to the HIGHER band (>= 2 is
 * "mid", not "junior") — same convention as benefitTier's threshold check
 * in src/lib/benefits.ts. Stored on `profiles.seniority_band` at publish
 * time (see publishProfile in seeker/actions.ts) rather than derived in SQL
 * — see supabase/migrations/0015_market_signals_by_dimension.sql for why. */
export function seniorityBand(totalYears: number): SeniorityBand {
  if (totalYears >= 15) return "executive";
  if (totalYears >= 10) return "staff";
  if (totalYears >= 5) return "senior";
  if (totalYears >= 2) return "mid";
  return "junior";
}

/** Renders derived stats as a plain sentence appended to the embedded text —
 * structured, consented facts, not raw prose, so this bypasses redact()
 * (same reasoning as dealbreaker_matrix already bypassing it). */
export function experienceFactsSentence(
  stats: ExperienceStats,
  extra: {
    skills: string[];
    desiredRoles: string[];
    industries: string[];
    referencesAvailable: boolean;
  },
): string {
  const parts: string[] = [];
  if (stats.totalYears > 0) {
    parts.push(`${stats.totalYears} years total experience`);
  }
  if (stats.dominantIndustry && stats.industryYears > 0) {
    parts.push(`${stats.industryYears} years in ${stats.dominantIndustry}`);
  }
  if (stats.avgTenureYears > 0) {
    parts.push(`average tenure ${stats.avgTenureYears} years per role`);
  }
  if (extra.skills.length > 0) {
    parts.push(`skills: ${extra.skills.join(", ")}`);
  }
  if (extra.desiredRoles.length > 0) {
    parts.push(`seeking roles: ${extra.desiredRoles.join(", ")}`);
  }
  if (extra.industries.length > 0) {
    parts.push(`target industries: ${extra.industries.join(", ")}`);
  }
  if (extra.referencesAvailable) {
    parts.push("references available");
  }
  return parts.length > 0 ? parts.join(". ") + "." : "";
}
