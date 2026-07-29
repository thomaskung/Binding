/**
 * Deterministic, pattern-matchable contact-identifier redaction — Layer 0 of
 * the privacy stack (DESIGN.md §2f): applied in-browser on the paste-text
 * path (identifiers never leave the device) and reused server-side at ingest
 * on the PDF path's returned/draft text (defense-in-depth ahead of the LLM
 * redaction pass). `resumes.raw_text` is NEVER pattern-stripped — it is the
 * faithful owner-only record (DSAR access copy).
 *
 * Deliberately narrow: emails, phones (HK/SG focus), SG NRIC/FIN, HKID.
 * Names/employers are the edge LLM redaction's job — pattern matching can't
 * do them, and claiming otherwise would be the kind of overclaim DESIGN §5
 * bans. Pure functions; unit tests in tests/pii-patterns.test.ts.
 */

export type PiiCategory = "email" | "phone" | "national_id";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// SG NRIC/FIN: S/T (citizens/residents), F/G, and M-prefix FINs issued since
// Jan 2022. HKID: 1-2 letters + 6 digits + check digit 0-9 or A, with the
// customary optional parentheses. Word-boundary anchored so e.g. a course
// code inside a longer token doesn't match.
const NRIC_FIN = /\b[STFGM]\d{7}[A-Z]\b/g;
const HKID = /\b[A-Z]{1,2}\d{6}(?:\([0-9A]\)|[0-9A])(?![0-9A-Za-z])/g;

// Phones, conservative by design (a resume is full of number-shaped
// non-phones — salaries, years, "2021 - 2024" ranges):
//  - international: +<cc> then 7-12 digits with optional space/hyphen groups
//  - local HK/SG 8-digit: two groups of 4 with an optional single separator,
//    guarded below against year-range false positives ("2021-2024").
const PHONE_INTL = /\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}(?:[\s-]?\d{2,4})?/g;
const PHONE_LOCAL = /\b(\d{4})([\s-]?)(\d{4})\b/g;

const YEAR = /^(19|20)\d{2}$/;

function stripLocalPhones(text: string): { text: string; found: boolean } {
  let found = false;
  const out = text.replace(PHONE_LOCAL, (whole, a: string, _sep: string, b: string) => {
    // "2021-2024" / "1998 2004" are year ranges, not phone numbers — leave
    // any 4+4 where BOTH halves read as years untouched.
    if (YEAR.test(a) && YEAR.test(b)) return whole;
    found = true;
    return "[phone removed]";
  });
  return { text: out, found };
}

export interface PiiStripResult {
  text: string;
  /** Which categories were detected (drives the preview warning copy). */
  found: PiiCategory[];
}

export function stripPiiPatterns(input: string): PiiStripResult {
  const found = new Set<PiiCategory>();
  let text = input;

  if (EMAIL.test(text)) {
    found.add("email");
    text = text.replace(EMAIL, "[email removed]");
  }
  EMAIL.lastIndex = 0;

  if (NRIC_FIN.test(text)) {
    found.add("national_id");
    text = text.replace(NRIC_FIN, "[ID removed]");
  }
  NRIC_FIN.lastIndex = 0;

  if (HKID.test(text)) {
    found.add("national_id");
    text = text.replace(HKID, "[ID removed]");
  }
  HKID.lastIndex = 0;

  if (PHONE_INTL.test(text)) {
    found.add("phone");
    text = text.replace(PHONE_INTL, "[phone removed]");
  }
  PHONE_INTL.lastIndex = 0;

  const local = stripLocalPhones(text);
  if (local.found) found.add("phone");
  text = local.text;

  return { text, found: [...found] };
}

/** Human copy for the preview warning ("emails, phone numbers"). */
export function describePiiCategories(categories: PiiCategory[]): string {
  const labels: Record<PiiCategory, string> = {
    email: "email addresses",
    phone: "phone numbers",
    national_id: "ID numbers",
  };
  return categories.map((c) => labels[c]).join(", ");
}
