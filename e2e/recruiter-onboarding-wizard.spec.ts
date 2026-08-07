import { expect, test } from "@playwright/test";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Recruiter onboarding's 3-step wizard (account+ToS -> company details ->
 * first-job-post hand-off), mirroring the seeker wizard's step-state pattern.
 * Fresh account via `ensureStagingUser` against hosted staging so this never
 * disturbs shared/demo data. Drives all 3 steps, then the skip-to-dashboard
 * path from step 3, and confirms step 2's fields actually persisted (not
 * just rendered) via a direct row read scoped to this test's own user id.
 *
 * Modal AI cost: ZERO — the wizard itself makes no AI round-trip (job
 * creation/publish, which would cost `ai.embed`, is deliberately not
 * exercised here; step 3 is only proven reachable via the skip path).
 */

test("recruiter onboarding: account -> company details -> first-job hand-off, skip lands on dashboard", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const name = uniqueLabel("Wanda Wizard");
  const company = uniqueLabel("Wizard Talent Co");

  // --- Step 1: account + ToS ---
  await signIn(page, recruiter.email);
  await page.waitForURL(/onboarding/);
  await page.getByTestId("choose-recruiter").click();
  await page.waitForURL(/onboarding\/recruiter$/);
  await page.getByTestId("recruiter-name").fill(name);
  await page.getByTestId("recruiter-company").fill(company);
  await page.getByTestId("recruiter-tos").check();
  await page.getByTestId("recruiter-continue").click();
  await page.waitForURL(/onboarding\/recruiter\/profile$/);

  // --- Step 2: company details ---
  // Cold Vercel lambda on staging — the default 5s expect timeout flakes on
  // this fresh server render.
  await expect(page.getByText("Step 2 of 3")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("recruiter-onboarding-title").fill("Head of Talent");
  await page.getByTestId("recruiter-onboarding-industry").fill("Fintech");
  await page.getByTestId("recruiter-onboarding-size").click();
  await page.getByRole("option", { name: "51–500" }).click();
  await page.getByTestId("recruiter-onboarding-phone").fill("+65 9123 4567");
  await page.getByTestId("recruiter-onboarding-continue").click();

  // --- Step 3: first-job-post hand-off ---
  // Cold Vercel lambda on staging (this render waits on the
  // saveRecruiterProfile server action, button stays disabled meanwhile) —
  // the default 5s expect timeout flakes.
  await expect(page.getByText("Step 3 of 3")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("recruiter-onboarding-post-job")).toBeVisible();
  await expect(page.getByTestId("recruiter-onboarding-finish-skip")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("recruiter-onboarding-finish-skip").click();
  await page.waitForURL(/\/recruiter$/, { timeout: 30_000 });
  // app-shell.spec.ts:114 found this same testid needs headroom even against
  // a local server — staging is strictly worse.
  await expect(page.getByTestId("points-balance")).toHaveText("100 points", {
    timeout: 15_000,
  });

  // Step 2's fields actually persisted, not just rendered mid-wizard.
  // recruiter.id is populated here — ensureStagingUser only returns "" on the
  // email_exists branch, which a fresh per-run counter email never hits.
  const admin = stagingAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("recruiter_title, company_industry, company_size, phone, display_name, company_name")
    .eq("id", recruiter.id)
    .single();
  expect(profile).toMatchObject({
    recruiter_title: "Head of Talent",
    company_industry: "Fintech",
    company_size: "mid",
    phone: "+65 9123 4567",
    display_name: name,
    company_name: company,
  });

  await ctx.close();
});
