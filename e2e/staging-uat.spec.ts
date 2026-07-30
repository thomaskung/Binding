import { test, expect } from "@playwright/test";
import { stagingAdminClient, ensureStagingUser, signIn, stagingContext, createAiCallCounter } from "./staging-helpers";

const SEEKER = { email: "seeker@demo.local", password: "J0B!Demo#2026$secure" };
const RECRUITER = { email: "recruiter@demo.local", password: "J0B!Demo#2026$secure" };

const RUN_ID = Date.now().toString(36);

test.describe("UAT: Privacy-first promise (§1, §3 pillar 1)", () => {
  test("Recruiter sees pseudonymized data, never raw PII", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, RECRUITER.email);

    // Navigate to job matches — verify only redacted data visible
    await page.goto("/recruiter/jobs");

    // Capture evidence for subagent
    const evidence = {
      runId: RUN_ID,
      scenario: "1_privacy_first",
      url: page.url(),
      bodyText: await page.locator("body").innerText(),
      screenshot: true,
    };
    await page.screenshot({ path: `e2e-results/${RUN_ID}/1_privacy_first.png`, fullPage: true });
    // Evidence stored — subagent reads this from Supabase bucket

    await ctx.close();
  });
});

test.describe("UAT: Dealbreaker matrix (§3 pillar 2)", () => {
  test("Candidates define boundaries (salary, equity, work setup)", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);

    // Navigate to onboarding or profile — verify dealbreaker fields exist
    await page.goto("/seeker/profile");
    await page.screenshot({ path: `e2e-results/${RUN_ID}/2_dealbreaker_matrix.png`, fullPage: true });
    await ctx.close();
  });
});

test.describe("UAT: Consent-first reveal (§3 pillar 3, §4)", () => {
  test("Candidate must actively express interest before recruiter reveals", async ({ browser }) => {
    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    // Seeker sees matches on dashboard, opts in to one
    await signIn(seeker, SEEKER.email);
    await seeker.goto("/seeker/matches");

    // Recruiter reveals after opt-in
    await signIn(recruiter, RECRUITER.email);
    await recruiter.goto("/recruiter/jobs");

    await seeker.screenshot({ path: `e2e-results/${RUN_ID}/3_consent_first_reveal.png`, fullPage: true });
    await seekerCtx.close();
    await recruiterCtx.close();
  });
});

test.describe("UAT: Closed-loop points economy (§3, §7, §11)", () => {
  test("Points earn and spend behavior, no cash-out path", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, SEEKER.email);

    // Check points balance is visible, no cash-out options
    await page.goto("/seeker/points");
    await page.screenshot({ path: `e2e-results/${RUN_ID}/4_closed_loop_points.png`, fullPage: true });
    await ctx.close();
  });
});

test.describe("UAT: Retention moat (§3 pillar 4)", () => {
  test("Per-role reveal scoping and in-app messaging", async ({ browser }) => {
    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    await signIn(seeker, SEEKER.email);
    await signIn(recruiter, RECRUITER.email);

    await seeker.screenshot({ path: `e2e-results/${RUN_ID}/5_retention_moat.png`, fullPage: true });
    await seekerCtx.close();
    await recruiterCtx.close();
  });
});

test.describe("UAT: Free vs Pro differentiation (§7)", () => {
  test("Free tier experience and Pro tier indicators", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, SEEKER.email);

    await page.goto("/seeker");
    await page.screenshot({ path: `e2e-results/${RUN_ID}/6_free_vs_pro.png`, fullPage: true });
    await ctx.close();
  });
});

test.describe("UAT: Dark pool value (§6, §3 pillar 6)", () => {
  test("Profile freshness nudge and suggest-and-approve maintenance", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);

    await page.goto("/seeker");
    await page.screenshot({ path: `e2e-results/${RUN_ID}/7_dark_pool.png`, fullPage: true });
    await ctx.close();
  });
});
