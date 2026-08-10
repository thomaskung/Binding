/** Pure scoring helpers for the recruiter Compare view — no DB, no React.
 * Overall match reuses the existing recruiter-visible score (not computed
 * here). These two are display-only dimension bars alongside it. */

/** Ratio of job skills also present in the candidate's skill list, matched
 * case-insensitively and trimmed. Returns 0 when the job lists no skills
 * (nothing to overlap against, not "perfect overlap"). */
export function skillsOverlapRatio(jobSkills: string[], candidateSkills: string[]): number {
  if (jobSkills.length === 0) return 0;
  const candidateSet = new Set(candidateSkills.map((s) => s.trim().toLowerCase()));
  const overlap = jobSkills.filter((s) => candidateSet.has(s.trim().toLowerCase())).length;
  return overlap / jobSkills.length;
}

/** Years of experience scaled to a documented ceiling — 15 years = 100%.
 * Picked as a reasonable senior-level ceiling; not derived from any
 * BUSINESS.md/DESIGN.md figure. Null years (not reported) scores 0. */
export const EXPERIENCE_CEILING_YEARS = 15;

export function experienceRatio(years: number | null): number {
  if (years === null || years <= 0) return 0;
  return Math.min(1, years / EXPERIENCE_CEILING_YEARS);
}
