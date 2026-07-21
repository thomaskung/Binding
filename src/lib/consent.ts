/** Bump when ToS/consent wording changes — stored with each acceptance so a
 * future revision can trigger re-consent. Placeholder text pending legal
 * review (LEGAL_REVIEW.md scope). */
export const CONSENT_VERSION = "2026-07-17-draft";

/** Market-signals opt-in (DESIGN.md §2e) — a SEPARATE consent from
 * CONSENT_VERSION above (AI-processing/redaction consent). Participating in
 * the aggregate market-intelligence product is independently opt-in and
 * revocable; bumping this must never imply re-consent to processing, or vice
 * versa. Placeholder text pending legal review (LEGAL_REVIEW.md Q7). */
export const MARKET_SIGNALS_CONSENT_VERSION = "2026-07-21-draft";
