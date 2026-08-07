import { expect, test } from "@playwright/test";
import { publishMatchingProfile } from "./match-helpers";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Layer-0 no-tracker posture (DESIGN.md §2f): resume-handling pages must
 * load zero third-party resources — no analytics, no CDN scripts, no
 * cross-origin anything. This is the enforceable slice of the CSP posture
 * (full nonce-CSP via middleware is deferred hardening, pre-public-launch).
 *
 * Runs against hosted staging — no seeded DB, no `seeker@demo.local`. Setup
 * (creating the account, onboarding, publishing a profile so the resume page
 * has real "already published" content to render — matching what the old
 * seeded-demo-seeker fixture gave us for free) happens in an UNTRACKED
 * context so its own network chatter (Modal calls, Supabase writes) never
 * pollutes the capture. A second, TRACKED context then repeats the exact
 * capture window the original had: login -> resume page load -> profile page
 * load.
 *
 * Modal AI cost: 2 round-trips (`ai.redact` + `ai.embed` via
 * `publishMatchingProfile` during setup) — counted internally by that
 * helper. Onboarding uses the free wizard-skip path (0 AI calls).
 */
test("resume-handling pages make no third-party requests", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);

  const firstPartyHosts = new Set(
    [baseURL, process.env.E2E_SUPABASE_URL]
      .filter((v): v is string => Boolean(v))
      .map((v) => new URL(v).host),
  );

  const user = await ensureStagingUser("seeker");

  // --- Untracked setup: get a fresh seeker onboarded and published so the
  // resume page has real content to render, without that setup traffic
  // (Modal, Supabase, onboarding lambdas) counting toward the capture. ---
  const setupCtx = await stagingContext(browser);
  const setupPage = await setupCtx.newPage();
  await signIn(setupPage, user.email);
  await completeSeekerOnboarding(setupPage, { name: uniqueLabel("No Tracker Seeker") });
  await publishMatchingProfile(setupPage);
  await setupCtx.close();

  // --- Tracked capture: fresh context/page, listener attached BEFORE any
  // navigation — covers /login itself, then the resume page (now showing the
  // published/redacted profile) and the profile page. ---
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const thirdParty: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return; // data:/blob:/about: etc.
    if (!firstPartyHosts.has(url.host)) thirdParty.push(req.url());
  });

  await signIn(page, user.email);

  await page.goto("/seeker/profile/resume");
  // Raised 60s -> 90s after a real staging timeout; this test's
  // test.setTimeout(300_000) above gives ample room under playwright.config.ts's
  // 120s default test cap.
  await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 90_000 });
  await page.goto("/seeker/profile");
  await page.waitForLoadState("networkidle");

  expect(thirdParty).toEqual([]);
  await ctx.close();
});
