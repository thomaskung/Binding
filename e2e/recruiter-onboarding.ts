import { expect, type Page } from "@playwright/test";

/**
 * Shared recruiter-onboarding walk for specs that need a fresh recruiter
 * account (or a second role on a dual-role account): chooser -> activation
 * (name + company + ToS) -> company details -> skip the first-job hand-off ->
 * recruiter dashboard.
 *
 * Seeds +100 pts via activateRecruiter. Ends on /recruiter$.
 */
export async function completeRecruiterOnboarding(
  page: Page,
  opts: { name: string; company: string },
) {
  await page.waitForURL(/onboarding/);
  // The role switcher routes straight to /onboarding/recruiter (chooser
  // skipped); a first-time sign-in lands on the chooser instead.
  if (!page.url().includes("/onboarding/recruiter")) {
    await page.getByTestId("choose-recruiter").click();
    await page.waitForURL(/onboarding\/recruiter/);
  }
  await page.getByTestId("recruiter-name").fill(opts.name);
  await page.getByTestId("recruiter-company").fill(opts.company);
  await page.getByTestId("recruiter-tos").check();
  await page.getByTestId("recruiter-continue").click();
  await page.waitForURL(/onboarding\/recruiter\/profile/);

  await page.getByTestId("recruiter-onboarding-industry").fill("Recruiting");
  await page.getByTestId("recruiter-onboarding-continue").click();
  await expect(page.getByTestId("recruiter-onboarding-finish-skip")).toBeVisible();
  await page.getByTestId("recruiter-onboarding-finish-skip").click();
  await page.waitForURL(/\/recruiter$/);
}
