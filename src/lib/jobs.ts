/** Pure helpers for the structured job-posting fields (skills/responsibilities/
 * requirements are stored as text[]; forms edit them as delimited text). */

export const EMPLOYMENT_TYPES = ["fulltime", "parttime", "contract", "intern"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  fulltime: "Full-time",
  parttime: "Part-time",
  contract: "Contract",
  intern: "Internship",
};

export type SalaryVisibility = "public" | "band" | "on_request";

/** Bucket width for the coarse `band` display (migration 0025, DESIGN §13a) —
 * a "$180k+"-style stealth range that's coarser than the exact figure but
 * still gives candidates a usable signal. $20k is the round-number pick the
 * task's own precedent range suggests; boundary cases are covered in
 * tests/jobs.test.ts. */
const SALARY_BAND_BUCKET = 20_000;

/** Round `salaryMin`/`salaryMax` out to the enclosing `SALARY_BAND_BUCKET`
 * multiples ("coarsening" — never narrows the true range) and format as
 * "$160k – $220k". If both bounds round into the same bucket (e.g. a tight
 * range, or the 0024 backfill's (0, 0) sentinel for legacy null rows), the
 * upper bound is bumped one bucket up so the display never degenerates to a
 * single figure — the whole point of `band` is to never show one exact
 * number. */
function coarseSalaryBand(salaryMin: number, salaryMax: number): string {
  const lo = Math.floor(salaryMin / SALARY_BAND_BUCKET) * SALARY_BAND_BUCKET;
  let hi = Math.ceil(salaryMax / SALARY_BAND_BUCKET) * SALARY_BAND_BUCKET;
  if (hi <= lo) hi = lo + SALARY_BAND_BUCKET;
  return `$${lo / 1000}k – $${hi / 1000}k`;
}

/** "Node.js, PostgreSQL, AWS" -> ["Node.js", "PostgreSQL", "AWS"] */
export function parseCommaList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One item per line -> string[], blank lines dropped. */
export function parseLineList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function salaryDisplay(
  salaryMin: number,
  salaryMax: number,
  visibility: SalaryVisibility,
): string {
  if (visibility === "on_request") return "Salary on request";
  if (visibility === "band") return coarseSalaryBand(salaryMin, salaryMax);
  // Both bounds are NOT NULL at the DB level since migration 0024 — salary is
  // mandatory at posting time (DESIGN §4a); the stealth path is handled by the
  // visibility branches above, never by null bounds.
  return `$${salaryMin.toLocaleString()} – $${salaryMax.toLocaleString()}`;
}

/** "3 days ago" / "Posted today" style relative label — no date library
 * needed for this coarse a granularity. */
export function relativeDayLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
