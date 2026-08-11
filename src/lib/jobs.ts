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

export type SalaryVisibility = "public" | "on_request";

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
  // Both bounds are NOT NULL at the DB level since migration 0024 — salary is
  // mandatory at posting time (DESIGN §4a); the stealth path is handled by the
  // visibility branch above, never by null bounds.
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
