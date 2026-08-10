import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { createAndPublishJob, publishMatchingProfile, widenMatchFilter } from "./match-helpers";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * UAT evidence capture against hosted staging: 7 rubric-scored scenarios
 * (`e2e/uat-rubric.json`) that mostly navigate + screenshot for the OpenCode
 * scorer — never the retired local seeded `seeker@demo.local` /
 * `recruiter@demo.local` logins, which are gone (local Supabase was retired
 * and `scripts/seed-staging.ts` actively deletes any `@demo.local` account it
 * finds).
 *
 * Scenario 1 (privacy-first) is the only one that genuinely needs a real,
 * embedded match to photograph — an empty recruiter match list is zero
 * evidence of pseudonymization — so it creates ONE seeker + ONE recruiter +
 * ONE published job and stashes their ids/emails in module-level state
 * (matching staging-functional.spec.ts's pipeline idiom: the test that needs
 * the data creates it, later tests in file order — workers:1,
 * fullyParallel:false — reuse it). Scenarios 3/5/7 reuse that same match
 * (opt-in, pre-reveal panel, staleness) at zero additional Modal cost.
 * Scenarios 2/4/6 only need an onboarded account, so they use the free
 * wizard-skip path.
 *
 * Modal AI cost: THREE round-trips for the whole file — `ai.redact` +
 * `ai.embed` via `publishMatchingProfile` and `ai.embed` via
 * `createAndPublishJob`, both self-counted by those helpers in scenario 1.
 * No other scenario calls Modal: scenario 5 (retention moat) shows the
 * pre-reveal gate rather than actually revealing, and scenario 7 (dark pool)
 * backdates the shared seeker's `last_profile_activity_at` directly via
 * `stagingAdminClient()` instead of publishing a second profile — both are
 * already covered functionally (reveal economics in smoke.spec.ts /
 * override.spec.ts, the maintenance-nudge loop in maintenance-nudge.spec.ts),
 * so re-spending real Modal money to re-photograph them here would be new
 * scope, not preserved intent.
 */

// Run id shared with the CI upload step and the scorer: GITHUB_RUN_ID in the
// nightly (a monotonically-increasing integer, so bucket listing by name finds
// the latest), local fallback for manual runs.
const RUN_ID = process.env.GITHUB_RUN_ID ?? Date.now().toString(36);
const EVIDENCE_DIR = `e2e-results/${RUN_ID}`;

// DOM state captured alongside each screenshot so the scorer has more than a
// pixel image (the rubric asks for "screenshots + DOM state"). page.screenshot
// creates parent directories, but writeFileSync does not — create it once up
// front so a scenario that crashes before its first screenshot can't poison
// the next scenario's DOM write.
mkdirSync(EVIDENCE_DIR, { recursive: true });

function captureDomState(page: import("@playwright/test").Page, name: string) {
  return page.evaluate(() => document.body.innerHTML).then((html) => {
    writeFileSync(`${EVIDENCE_DIR}/${name}_dom.html`, html, "utf8");
  });
}

// Shared privacy/consent/reveal-scoping/staleness fixture, assigned by
// scenario 1 and consumed by scenarios 3, 5, 7.
let sharedSeekerEmail = "";
let sharedSeekerId = "";
let sharedSeekerName = "";
let sharedRecruiterEmail = "";
let sharedJobId = "";

test.describe("UAT: Privacy-first promise (§1, §3 pillar 1)", () => {
  test("Recruiter sees pseudonymized data, never raw PII", async ({ browser }) => {
    // Two fresh accounts, one publish, one job — comfortably past the
    // default 120s test timeout once cold-lambda logins/onboarding are
    // included (same headroom as smoke.spec.ts's equivalent walk).
    test.setTimeout(420_000);

    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    const seekerUser = await ensureStagingUser("seeker");
    if (!seekerUser.id) throw new Error(`ensureStagingUser returned no id for ${seekerUser.email} (email collision)`);
    const recruiterUser = await ensureStagingUser("recruiter");
    const seekerName = uniqueLabel("UAT Seeker");

    await signIn(seeker, seekerUser.email);
    await completeSeekerOnboarding(seeker, { name: seekerName });
    await publishMatchingProfile(seeker); // ai.redact + ai.embed

    await signIn(recruiter, recruiterUser.email);
    await completeRecruiterOnboarding(recruiter, {
      name: uniqueLabel("UAT Recruiter"),
      company: uniqueLabel("UAT Recruiting Co"),
    });
    const { jobId } = await createAndPublishJob(recruiter); // ai.embed

    sharedSeekerEmail = seekerUser.email;
    sharedSeekerId = seekerUser.id;
    sharedSeekerName = seekerName;
    sharedRecruiterEmail = recruiterUser.email;
    sharedJobId = jobId;

    // Navigate list -> detail (own job, not a blind `.first()`) into the
    // job's match list to capture the non-identifying candidate labels +
    // credential summaries.
    await recruiter.goto("/recruiter/jobs");
    await recruiter.locator(`a[href="/recruiter/jobs/${jobId}"]`).first().click();
    await recruiter.getByTestId("view-matches").click();
    await widenMatchFilter(recruiter);
    const matchCard = recruiter.getByTestId("recruiter-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 60_000 });
    await recruiter.screenshot({ path: `e2e-results/${RUN_ID}/1_privacy_first_matches.png`, fullPage: true });
    await captureDomState(recruiter, "1_privacy_first_matches");

    // Open the candidate's pre-reveal detail panel — the strongest single
    // surface for the privacy invariant: full strength/credential detail,
    // never the seeker's real name.
    await matchCard.click();
    const panel = recruiter.getByTestId("candidate-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    expect(await panel.innerText()).not.toContain(seekerName);
    await recruiter.screenshot({ path: `e2e-results/${RUN_ID}/1_privacy_first.png`, fullPage: true });
    await captureDomState(recruiter, "1_privacy_first");

    await seekerCtx.close();
    await recruiterCtx.close();
  });
});

test.describe("UAT: Dealbreaker matrix (§3 pillar 2)", () => {
  test("Candidates define boundaries (salary, equity, work setup)", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await completeSeekerOnboarding(page, { name: uniqueLabel("UAT Dealbreaker Seeker") });

    // The dealbreaker fields (min salary, equity required, work setup) only
    // render in the profile's editing mode.
    await page.goto("/seeker/profile");
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByTestId("dealbreaker-equity")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-results/${RUN_ID}/2_dealbreaker_matrix.png`, fullPage: true });
    await captureDomState(page, "2_dealbreaker_matrix");
    await ctx.close();
  });
});

test.describe("UAT: Consent-first reveal (§3 pillar 3, §4)", () => {
  test("Candidate must actively express interest before recruiter reveals", async ({ browser }) => {
    test.skip(
      !sharedSeekerEmail || !sharedJobId || !sharedRecruiterEmail || !sharedSeekerName,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    // Seeker sees the shared match on the dashboard and actively opts in —
    // the consent gate a recruiter reveal depends on.
    await signIn(seeker, sharedSeekerEmail);
    await seeker.goto("/seeker/matches");
    const matchCard = seeker.getByTestId("seeker-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 60_000 });
    await matchCard.getByTestId("match-interested").click();
    // exact: true — the status BADGE ("interested"), not the "I'm interested"
    // button that substring-matching would hit instantly, before the server
    // write commits (see smoke.spec.ts for the same race).
    await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Recruiter now sees the opt-in status, but still no identity — reveal
    // remains a separate, explicit action.
    await signIn(recruiter, sharedRecruiterEmail);
    await recruiter.goto(`/recruiter/jobs/${sharedJobId}`);
    await recruiter.getByTestId("view-matches").click();
    await widenMatchFilter(recruiter);
    await expect(
      recruiter.getByTestId("recruiter-match-card").filter({ hasText: "interested" }).first(),
    ).toBeVisible({ timeout: 60_000 });
    expect(await recruiter.locator("body").innerText()).not.toContain(sharedSeekerName);

    await seeker.screenshot({ path: `e2e-results/${RUN_ID}/3_consent_first_reveal.png`, fullPage: true });
    await captureDomState(seeker, "3_consent_first_reveal");
    await seekerCtx.close();
    await recruiterCtx.close();
  });
});

test.describe("UAT: Closed-loop points economy (§3, §7, §11)", () => {
  test("Points earn and spend behavior, no cash-out path", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await completeSeekerOnboarding(page, { name: uniqueLabel("UAT Points Seeker") });

    // Points balance visible, no cash-out affordance anywhere on the page.
    await page.goto("/seeker/points");
    await expect(page.getByTestId("points-page-balance")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-results/${RUN_ID}/4_closed_loop_points.png`, fullPage: true });
    await captureDomState(page, "4_closed_loop_points");
    await ctx.close();
  });
});

test.describe("UAT: Retention moat (§3 pillar 4)", () => {
  test("Per-role reveal scoping and in-app messaging", async ({ browser }) => {
    test.skip(
      !sharedSeekerEmail || !sharedRecruiterEmail || !sharedJobId,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    await signIn(seeker, sharedSeekerEmail);
    await signIn(recruiter, sharedRecruiterEmail);

    // Pre-reveal: the recruiter's own gated reveal control is visible, but
    // the messaging surface doesn't exist until an explicit reveal happens —
    // per-role scoping, captured without spending points on a real reveal
    // (economics of the reveal itself are covered by smoke.spec.ts).
    await recruiter.goto(`/recruiter/jobs/${sharedJobId}`);
    await recruiter.getByTestId("view-matches").click();
    await widenMatchFilter(recruiter);
    await recruiter.getByTestId("recruiter-match-card").filter({ hasText: "interested" }).first().click();
    const panel = recruiter.getByTestId("candidate-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(recruiter.getByTestId("reveal-candidate")).toBeVisible();
    await expect(recruiter.getByTestId("open-thread")).toHaveCount(0);

    await seeker.goto("/seeker/matches");
    await expect(seeker.getByTestId("seeker-match-card").first()).toBeVisible({ timeout: 60_000 });

    await seeker.screenshot({ path: `e2e-results/${RUN_ID}/5_retention_moat.png`, fullPage: true });
    await captureDomState(seeker, "5_retention_moat");
    await seekerCtx.close();
    await recruiterCtx.close();
  });
});

test.describe("UAT: Free vs Pro differentiation (§7)", () => {
  test("Free tier experience and Pro tier indicators", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await completeSeekerOnboarding(page, { name: uniqueLabel("UAT Free Tier Seeker") });

    await page.goto("/seeker");
    await expect(page.getByTestId("pro-upsell-card")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-results/${RUN_ID}/6_free_vs_pro.png`, fullPage: true });
    await captureDomState(page, "6_free_vs_pro");
    await ctx.close();
  });
});

test.describe("UAT: Dark pool value (§6, §3 pillar 6)", () => {
  test("Profile freshness nudge and suggest-and-approve maintenance", async ({ browser }) => {
    test.skip(
      !sharedSeekerId || !sharedSeekerEmail,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );

    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();

    // Reuse scenario 1's already-published shared seeker — no product
    // surface can fast-forward the staleness window, so backdate directly
    // (same technique as maintenance-nudge.spec.ts) rather than publishing a
    // second profile just to re-demonstrate the same nudge card.
    const admin = stagingAdminClient();
    await admin
      .from("profiles")
      .update({ last_profile_activity_at: new Date(Date.now() - 100 * 86_400_000).toISOString() })
      .eq("id", sharedSeekerId);

    await signIn(page, sharedSeekerEmail);
    await page.goto("/seeker");
    await expect(page.getByTestId("stale-nudge-card")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-results/${RUN_ID}/7_dark_pool.png`, fullPage: true });
    await captureDomState(page, "7_dark_pool");
    await ctx.close();
  });
});
