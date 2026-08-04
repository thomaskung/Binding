/**
 * Derives the recruiter card's non-identifying descriptive label + strength
 * chips from the pseudonymized fields the match_candidates RPC returns. The
 * card's job is to sell the reveal: show enough strength to be worth points,
 * without leaking who the candidate is. Founder decisions (2026-08-04):
 *  - label = `{desired role || seniority title} · {region} · {banded years}`
 *  - years are BANDED, never exact, to blunt re-identification in small pools.
 * Pure functions; tests in tests/candidate-card.test.ts.
 */

const SENIORITY_TITLE: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  executive: "Executive",
};

export function seniorityTitle(band: string | null | undefined): string | null {
  if (!band) return null;
  return SENIORITY_TITLE[band] ?? null;
}

/** Bucket exact years into a coarse band (never the raw number on the card). */
export function yearsBand(years: number | null | undefined): string | null {
  if (years == null || Number.isNaN(years) || years <= 0) return null;
  if (years < 2) return "<2 yrs";
  if (years < 5) return "2–5 yrs";
  if (years < 10) return "5–10 yrs";
  return "10+ yrs";
}

export interface CandidateLabelInput {
  desiredRoles?: string[] | null;
  seniorityBand?: string | null;
  region?: string | null;
  yearsExperience?: number | null;
}

/** e.g. "Senior Backend Engineer · HK · 5–10 yrs". Drops any missing segment;
 * falls back to a generic when nothing is known. */
export function candidateLabel(input: CandidateLabelInput): string {
  const role =
    input.desiredRoles?.find((r) => r && r.trim())?.trim() ??
    seniorityTitle(input.seniorityBand) ??
    "Candidate";
  const segments = [role, input.region?.trim() || null, yearsBand(input.yearsExperience)].filter(
    (s): s is string => !!s,
  );
  return segments.join(" · ");
}

/** The "years + seniority" strength chip, e.g. "Senior · 5–10 yrs". */
export function seniorityChip(
  seniorityBand: string | null | undefined,
  yearsExperience: number | null | undefined,
): string | null {
  const title = seniorityTitle(seniorityBand);
  const band = yearsBand(yearsExperience);
  const parts = [title, band].filter((s): s is string => !!s);
  return parts.length ? parts.join(" · ") : null;
}
