import type { CompanyIdentifier } from "@/lib/ai/types";

/**
 * Web-search grounding for AI Company Research (DESIGN.md §14k, Phase 14).
 * This is the stack's first outbound egress path outside Modal and the
 * JD-only frontier lane — the self-hosted Modal LLM has no internet access,
 * so a real public-source fetch happens here, and Modal only ever
 * summarizes the text this module returns (src/lib/ai/modal.ts's
 * `researchCompany`).
 *
 * Targets the Brave Search API (single GET, `X-Subscription-Token` header,
 * documented JSON shape: `web.results[].{title,description,url}`) — chosen
 * for this phase over a generic multi-vendor abstraction, per an explicit
 * founder decision (no real Brave account/key exists in this environment,
 * so the response-shape handling below is UNTESTED against a live key —
 * `normalizeBraveResults` degrades to an empty result list rather than
 * throwing on an unexpected shape, so a live-account surprise fails soft
 * into "no grounding info found," not a crash).
 *
 * Cost note: unlike every Modal call, this fetch is NOT tracked by
 * `e2e/staging-helpers.ts`'s `countAiCall()`/`AI_CALL_BUDGET` — that
 * mechanism is Modal-specific by name and by every existing call site.
 * Same untracked posture as Google Drive's `files.list`/`export` quota
 * spend (src/lib/google-drive.ts) — a real cost, on a separate line,
 * with no existing precedent for tracking it in this test suite.
 */

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface BraveWebResult {
  title?: unknown;
  description?: unknown;
  url?: unknown;
}

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export function config(): { apiKey: string } {
  const apiKey = process.env.WEB_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("Company research requires WEB_SEARCH_API_KEY (Brave Search API)");
  }
  return { apiKey };
}

/** Defensive normalization for Brave's response — same "malformed degrades
 * to empty, never a crash" posture as modal.ts's normalizeJobDraft. An
 * entry missing a title/url is dropped rather than kept with a blank half.
 * Exported (not just used internally) so it's directly unit-testable
 * without a real network call — same discipline as Phase 10's distinction
 * between "genuinely untestable, exclude from coverage" (browser-only
 * WebAuthn code) and "testable, write a real test" (this). */
export function normalizeBraveResults(raw: unknown): WebSearchResult[] {
  const results = Array.isArray((raw as { web?: { results?: unknown } })?.web?.results)
    ? ((raw as { web: { results: unknown[] } }).web.results as BraveWebResult[])
    : [];
  return results
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      snippet: typeof r.description === "string" ? r.description : "",
      url: typeof r.url === "string" ? r.url : "",
    }))
    .filter((r) => r.title !== "" && r.url !== "");
}

/** Pure assembly — mockable/testable without a real network call. Caps
 * total length so the Modal summarization call gets a bounded prompt. */
export function assembleGroundingText(results: WebSearchResult[]): string {
  const MAX_CHARS = 4000;
  const blocks = results.map((r) => `${r.title}\n${r.snippet}\n(${r.url})`);
  let text = blocks.join("\n\n");
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return text;
}

/** Fetch + assemble public-source grounding text for one company. Throws on
 * a failed/missing-key request rather than degrading — an ungrounded
 * summary would defeat the whole point of "aggregated public information,"
 * so a search failure must surface as "research unavailable," never a
 * silent fabricated-sounding fallback. */
export async function searchCompanyInfo(company: CompanyIdentifier): Promise<string> {
  const { apiKey } = config();
  const query = `${company} company culture reviews news`;
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=10`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Brave Search request failed: ${res.status}`);
  }
  const raw = await res.json();
  const results = normalizeBraveResults(raw);
  return assembleGroundingText(results);
}
