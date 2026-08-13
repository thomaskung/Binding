import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `exportMyData` (src/app/(app)/seeker/actions.ts, Phase 6 DSAR export) reads
 * from `matches`, which carries the raw cosine `score` column — recruiter-only
 * per migration 0001's own comment and the CLAUDE.md invariant that a seeker
 * never sees the raw number, only the qualitative band (matchBand()). That
 * invariant applies to a seeker exporting their OWN data too: this asserts
 * the export maps each match through matchBand() and strips the raw `score`
 * key before returning JSON, so a future edit can't silently reintroduce it.
 */
const ACTIONS_PATH = join(__dirname, "..", "src", "app", "(app)", "seeker", "actions.ts");
const source = readFileSync(ACTIONS_PATH, "utf8");

function exportMyDataBody(): string {
  const start = source.indexOf("export async function exportMyData");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end);
}

describe("exportMyData — raw match score never reaches the seeker's own export", () => {
  it("maps matches through matchBand()", () => {
    expect(exportMyDataBody()).toMatch(/matchBand\(/);
  });

  it("destructures score out of each match rather than passing it through", () => {
    expect(exportMyDataBody()).toMatch(/\{\s*score,\s*\.\.\.rest\s*\}/);
  });

  it("the returned matches array is not the raw query result", () => {
    expect(exportMyDataBody()).toMatch(/matches:\s*bandedMatches/);
    expect(exportMyDataBody()).not.toMatch(/matches:\s*matches\s*\?\?/);
  });
});
