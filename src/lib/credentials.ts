/**
 * Credentials generalization — the de-identified "bonus" strength signal shown
 * on the recruiter card (awards/certs/patents). Founder directive: seekers
 * type these free-text; recruiters only ever see a GENERALIZED summary that
 * can't fingerprint the person ("Patent US10,123,456 for fraud detection" →
 * "patent-holder"). A specific patent number or a rare award title is exactly
 * the kind of quasi-identifier the redaction stack exists to remove.
 *
 * Two layers, mirroring the redaction stack:
 *  - `credentialsFloorSummary` — deterministic category+count rollup. This is
 *    the PRODUCTION FLOOR: always safe, never leaks a specific, no model
 *    needed. It's the stub-provider output and the fallback when the LLM path
 *    produces anything that still looks identifying.
 *  - the Modal LLM (see ai/modal.ts `generalizeCredentials`) may produce nicer
 *    prose ON TOP, but only if `credentialsLooksSafe` passes — it can only
 *    ever remove specifics, never reintroduce them.
 *
 * Raw credentials are candidate-derived → the LLM path is Modal-only, never a
 * frontier API (same rule as redact/extract). Pure functions; tests in
 * tests/credentials.test.ts.
 */

export type CredentialCategory = "patent" | "certification" | "award" | "publication" | "credential";

const CATEGORY_PATTERNS: [CredentialCategory, RegExp][] = [
  ["patent", /\bpatent/i],
  [
    "certification",
    /\b(certif|CISSP|CISM|CCSP|CIPP|CIPM|CKA|CKAD|PMP|CFA|FRM|AWS|Azure|GCP|ISO\s?\d|licen[sc]e|accredit)/i,
  ],
  ["award", /\b(award|winner|won\b|honou?r|medal|prize|finalist|recogni[sz]ed)/i],
  ["publication", /\b(publica|paper|journal|author(ed)?|book|patent-pending|whitepaper)/i],
];

const PLURAL: Record<CredentialCategory, [string, string]> = {
  patent: ["patent", "patents"],
  certification: ["certification", "certifications"],
  award: ["award", "awards"],
  publication: ["publication", "publications"],
  credential: ["credential", "credentials"],
};

/** Split free-text credentials into individual items (newline / ; / • / comma). */
export function parseCredentialItems(raw: string): string[] {
  return raw
    .split(/[\n;•·]|,(?![^(]*\))/) // split on separators, but not commas inside parentheses
    .map((s) => s.trim())
    .filter(Boolean);
}

function classify(item: string): CredentialCategory {
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(item)) return cat;
  return "credential";
}

/** Deterministic, always-safe rollup: "2 patents · 3 certifications · 1 award". */
export function credentialsFloorSummary(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const counts = new Map<CredentialCategory, number>();
  for (const item of parseCredentialItems(raw)) {
    const cat = classify(item);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const order: CredentialCategory[] = ["patent", "certification", "award", "publication", "credential"];
  const parts: string[] = [];
  for (const cat of order) {
    const n = counts.get(cat);
    if (!n) continue;
    parts.push(`${n} ${PLURAL[cat][n === 1 ? 0 : 1]}`);
  }
  return parts.join(" · ");
}

/** Guard for LLM-generalized output: reject anything that still carries a
 * specific identifier (a patent/registration number, a 4-digit year, a URL, an
 * email/phone) so a weak model can never smuggle a fingerprint through. If this
 * fails, callers fall back to `credentialsFloorSummary`. */
export function credentialsLooksSafe(summary: string): boolean {
  if (!summary.trim()) return false;
  const risky = [
    /\b[A-Z]{1,3}[- ]?\d{4,}\b/, // patent/registration numbers e.g. US10123456
    /\d{4,}/, // any 4+ digit run (years, ids, numbers)
    /https?:\/\//i, // URLs
    /[\w.+-]+@[\w-]+\.[\w.]+/, // emails
    /\+?\d[\d\s()-]{7,}\d/, // phones
  ];
  return !risky.some((re) => re.test(summary));
}
