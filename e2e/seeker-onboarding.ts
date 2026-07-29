import { expect, type Page } from "@playwright/test";

/**
 * Shared seeker-onboarding walk for specs that need a fresh seeker account:
 * chooser -> consent gate -> resume-first wizard (paste+extract when
 * `resumeText` is given, wizard-skip otherwise) -> dashboard.
 *
 * The consent gate checks the two REQUIRED consents (processing + automated
 * profiling) — continuous-maintenance consent is OPTIONAL (LEGAL_REVIEW.md
 * Q14) and only checked when a spec opts in via `maintenanceConsent` (the
 * maintenance-nudge spec needs it; everything else leaves it off, matching
 * the real default).
 */
export async function completeSeekerOnboarding(
  page: Page,
  opts: { name: string; resumeText?: string; maintenanceConsent?: boolean },
) {
  await page.waitForURL(/onboarding/);
  await page.getByTestId("choose-seeker").click();
  await page.waitForURL(/onboarding\/seeker/);
  await page.getByTestId("onboard-name").fill(opts.name);
  await page.getByTestId("onboard-tos").check();
  await page.getByTestId("onboard-consent").check();
  await page.getByTestId("onboard-profiling").check();
  if (opts.maintenanceConsent) {
    await page.getByTestId("onboard-maintenance").check();
  }
  await page.getByTestId("onboard-continue").click();
  await page.waitForURL(/onboarding\/seeker\/profile/);

  if (opts.resumeText) {
    await page.getByTestId("onboarding-resume-paste").fill(opts.resumeText);
    await page.getByTestId("onboarding-extract").click();
    await expect(page.getByTestId("onboarding-continue-dealbreakers")).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByTestId("onboarding-continue-dealbreakers").click();
    await page.getByTestId("onboarding-finish").click();
  } else {
    await page.getByTestId("wizard-skip").click();
  }
  await page.waitForURL(/\/seeker$/);
}
