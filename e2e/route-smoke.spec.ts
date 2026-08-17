import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Basic post-deploy render coverage for routes that previously had zero e2e
 * coverage in any tier. Zero AI/Modal cost — seeker onboarding wizard-skips,
 * recruiter onboarding seeds a single job with no publish/embed step.
 *
 * Each route asserts a real heading renders (proving it isn't a broken/error
 * page), running against deployed staging after every merge (part of the
 * `smoke` job in `.github/workflows/deploy-staging.yml`).
 *
 * Added 2026-08-17.
 */

test("Seeker: settings/points/nudge/skill-assessments/account routes render", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  const user = await ensureStagingUser("seeker");
  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Smoke Seeker") });

  // /seeker/settings/privacy
  await page.goto("/seeker/settings/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy settings" })).toBeVisible({
    timeout: 15_000,
  });

  // /seeker/settings/security
  await page.goto("/seeker/settings/security");
  await expect(page.getByRole("heading", { level: 1, name: "Security settings" })).toBeVisible({
    timeout: 15_000,
  });

  // /seeker/points
  await page.goto("/seeker/points");
  await expect(page.getByRole("heading", { level: 1, name: "Points" })).toBeVisible({
    timeout: 15_000,
  });

  // /seeker/nudge — fresh seeker has not given optional maintenance consent,
  // so the opt-in-prompt testid is what renders
  await page.goto("/seeker/nudge");
  await expect(page.getByTestId("nudge-enable-maintenance")).toBeVisible({
    timeout: 15_000,
  });

  // /seeker/skill-assessments
  await page.goto("/seeker/skill-assessments");
  await expect(page.getByRole("heading", { level: 1, name: "Skill assessments" })).toBeVisible({
    timeout: 15_000,
  });

  // /account
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible({
    timeout: 15_000,
  });

  // /settings
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({
    timeout: 15_000,
  });

  await ctx.close();
});

test("Recruiter: profile/job-detail/matches routes render", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const admin = stagingAdminClient();

  const user = await ensureStagingUser("recruiter");
  await signIn(page, user.email);
  await completeRecruiterOnboarding(page, {
    name: uniqueLabel("Smoke Recruiter"),
    company: uniqueLabel("Smoke Co"),
  });

  // Seed one job posting — direct admin insert, no publish/embed step, zero Modal cost
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: user.id,
      title: uniqueLabel("Smoke Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "active",
    })
    .select("id, title")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);

  // /recruiter/profile
  await page.goto("/recruiter/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Your profile" })).toBeVisible({
    timeout: 15_000,
  });

  // /recruiter/jobs/${id}
  await page.goto(`/recruiter/jobs/${job.id}`);
  await expect(page.getByRole("heading", { level: 1, name: job.title })).toBeVisible({
    timeout: 15_000,
  });

  // /recruiter/jobs/${id}/matches
  await page.goto(`/recruiter/jobs/${job.id}/matches`);
  await expect(page.getByRole("heading", { level: 1, name: job.title })).toBeVisible({
    timeout: 15_000,
  });

  // /settings
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({
    timeout: 15_000,
  });

  await ctx.close();
});
