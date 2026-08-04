/**
 * Deterministic redaction of quasi-identifiers we ALREADY HOLD STRUCTURED —
 * the hybrid half of the redaction stack (see G1, founder-resume test
 * 2026-08-04). The self-hosted LLM (`ai.redact`) is meant to remove the
 * seeker's name, employers, schools and address, but the small Modal model
 * proved unreliable at it and returned resumes near-verbatim. We don't need a
 * model to find these: the real name lives on `profiles.display_name` and the
 * employer names on `seeker_experience.company`. This pass strips those exact
 * strings from the LLM output so the recruiter-visible `redacted_text` can
 * never leak them, regardless of model quality.
 *
 * The LLM pass still runs on top (date→range generalization, scale wording,
 * catching identifiers we DON'T hold structured — e.g. school names, which
 * aren't captured as fields yet). `resumes.raw_text` is never touched (it is
 * the faithful owner-only DSAR copy). Pure functions; tests in
 * tests/redact-known.test.ts.
 *
 * NOTE: email/phone/national-id are handled deterministically upstream by
 * `stripPiiPatterns` (Layer 0, applied to draft text at ingest / in-browser),
 * so this module deliberately does NOT duplicate them.
 */

export interface KnownIdentifiers {
  /** The seeker's real name(s) — e.g. profiles.display_name. */
  names: string[];
  /** Employer / school / organisation names — e.g. seeker_experience.company. */
  organizations: string[];
}

export interface RedactKnownResult {
  text: string;
  removed: { names: boolean; organizations: boolean; address: boolean };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Corporate suffixes stripped from an org before matching, so "Crypto.com" and
// "Rakkar Digital Pte Ltd" both match their core name wherever it appears.
const ORG_SUFFIX = /\b(pte\.?|ltd\.?|limited|llc|inc\.?|co\.?|corp\.?|gmbh|plc|company|group|holdings?)\b/gi;

// Generic org/geographic words that are NOT distinctive enough to strip on
// their own (would over-redact unrelated text). A multi-word employer's
// DISTINCTIVE tokens (e.g. "Protiviti" in "Protiviti Hong Kong Co., Limited")
// are stripped standalone too, since the resume often mentions the brand token
// alone — the phrase match alone misses those.
const ORG_STOPWORDS = new Set([
  "hong", "kong", "singapore", "china", "asia", "asian", "global", "telecom", "digital",
  "financial", "finance", "services", "service", "group", "holdings", "holding", "technologies",
  "technology", "solutions", "systems", "system", "consulting", "capital", "ventures", "partners",
  "international", "company", "corporation", "satellite", "enterprise", "blockchain", "association",
  "network", "networks", "labs", "studio", "media", "data",
]);

function distinctiveOrgTokens(org: string): string[] {
  const tokens = org.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 2) return []; // single-word orgs are covered by the phrase match
  return tokens.filter((t) => {
    const alpha = t.replace(/[^A-Za-z]/g, "");
    if (ORG_STOPWORDS.has(alpha.toLowerCase())) return false;
    // Distinctive = a long-ish brand word, or a short ALL-CAPS acronym (PCCW).
    return alpha.length >= 5 || (alpha.length >= 3 && alpha === alpha.toUpperCase());
  });
}

// Address spans (HK/SG focus): anchor on strong locality/unit tokens and
// consume the surrounding comma-separated run. Best-effort — names/orgs are the
// high-confidence strips; this reduces obvious street-address leakage.
const ADDRESS_SPAN =
  /(?:Flat|Unit|Room|Block|Tower|House|Floor|\d+\/F)\b[^.\n]*?\b(?:Road|Street|Rd|St|Avenue|Ave|Lane|Estate|Kowloon|Hong Kong|Singapore|N\.?T\.?)\b[^.\n]*/gi;

function nameVariants(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  // Individual tokens of length >= 3 (skip initials / short particles that
  // would over-match common words). Comma-form names ("KUNG Siu Kei, Thomas")
  // split on both comma and whitespace.
  for (const tok of trimmed.split(/[\s,]+/)) {
    if (tok.replace(/[^A-Za-z]/g, "").length >= 3) variants.add(tok);
  }
  // Longest first so the full name is replaced before its component tokens.
  return [...variants].sort((a, b) => b.length - a.length);
}

/** Strip known names, organisations and obvious address spans. Idempotent. */
export function redactKnownIdentifiers(input: string, known: KnownIdentifiers): RedactKnownResult {
  let text = input;
  const removed = { names: false, organizations: false, address: false };

  for (const name of known.names ?? []) {
    for (const variant of nameVariants(name)) {
      const re = new RegExp(`\\b${escapeRe(variant)}\\b`, "gi");
      if (re.test(text)) {
        removed.names = true;
        text = text.replace(re, "[name removed]");
      }
    }
  }

  for (const org of known.organizations ?? []) {
    const core = org.replace(ORG_SUFFIX, "").replace(/[.,]/g, " ").trim();
    // Full name + suffix-stripped core (phrase matches), plus each distinctive
    // brand token standalone (catches "…at Protiviti…" where the phrase misses).
    const candidates = [org.trim(), core, ...distinctiveOrgTokens(org)].filter(
      (s) => s.replace(/[^A-Za-z0-9]/g, "").length >= 3,
    );
    for (const candidate of candidates) {
      // Collapse internal whitespace to \s+ so multi-word orgs match across
      // the single-line blob unpdf produces.
      const pattern = escapeRe(candidate).replace(/\\?\s+/g, "\\s+");
      const re = new RegExp(`\\b${pattern}\\b`, "gi");
      if (re.test(text)) {
        removed.organizations = true;
        text = text.replace(re, "[former employer]");
      }
    }
  }

  if (ADDRESS_SPAN.test(text)) {
    removed.address = true;
    text = text.replace(ADDRESS_SPAN, "[address removed]");
  }
  ADDRESS_SPAN.lastIndex = 0;

  return { text, removed };
}
