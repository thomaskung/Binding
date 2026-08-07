import { expect, test, type Page } from "@playwright/test";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";

/**
 * App-shell nav rail (NavShell mockup template) against hosted staging:
 * confirms the persistent nav renders on authenticated pages, its links land
 * on the right screens, and the mode switcher exposes the disabled
 * Enterprise tab. The rail starts collapsed (mockup default), so each rail
 * test expands it first via the hamburger toggle.
 *
 * Fresh per-run seeker/recruiter accounts (`ensureStagingUser` +
 * `completeSeekerOnboarding`/`completeRecruiterOnboarding`, both wizard-skip
 * paths) replace the old seeded `seeker@demo.local`/`recruiter@demo.local`
 * logins — this is chrome, not data, so nothing here needs a published
 * profile, a job, or a match. Each test gets its OWN `stagingContext` +
 * onboarding walk rather than sharing one seeker/recruiter across tests:
 * `rail_open` is a cookie, and "the rail starts collapsed" is the
 * precondition every `expandRail()` call depends on — a shared context would
 * carry `rail_open=true` from an earlier test into the next one and the
 * "Expand navigation" toggle wouldn't be there to click.
 *
 * Modal AI cost: ZERO. Both onboarding walks use the free paths
 * (`completeSeekerOnboarding` with no `resumeText` = wizard-skip;
 * `completeRecruiterOnboarding` ends on `recruiter-onboarding-finish-skip`) —
 * no `countAiCall()`/`assertAiCallBudget()` plumbing needed in this file.
 */

async function expandRail(page: Page) {
  const button = page.getByRole("button", { name: "Expand navigation" });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
}

test("seeker nav rail: Job and Benefit land on the right screens", async ({ browser }) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");
  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Rail Seeker") });
  await expandRail(page);

  await page.getByRole("link", { name: "Job", exact: true }).click();
  await page.waitForURL(/\/seeker\/matches$/);

  await page.getByRole("link", { name: "Benefit", exact: true }).click();
  await page.waitForURL(/\/benefits$/);
  // Shell persists on a non-exemplar page too — nav is still there to leave from.
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await ctx.close();
});

test("recruiter nav rail: all five items live, no disabled placeholders", async ({ browser }) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("recruiter");
  await signIn(page, user.email);
  await completeRecruiterOnboarding(page, {
    name: uniqueLabel("Rail Recruiter"),
    company: uniqueLabel("Rail Co"),
  });
  await expandRail(page);

  const nav = page.locator("aside nav");
  // Mockup nav: every rail item is a live link — the old Pipeline/Candidates/
  // Team training placeholders are gone.
  await expect(nav.getByRole("link")).toHaveCount(5, { timeout: 15_000 });
  await expect(nav.getByText("Pipeline")).toHaveCount(0);
  await expect(nav.getByText("Candidates")).toHaveCount(0);

  await page.getByRole("link", { name: "Market intel" }).click();
  await page.waitForURL(/\/recruiter\/market-intelligence$/);
  await expect(page.getByRole("link", { name: "Job postings" })).toBeVisible();

  await page.getByRole("link", { name: "Job postings" }).click();
  await page.waitForURL(/\/recruiter\/jobs$/);

  await ctx.close();
});

test("mode switcher exposes a disabled Enterprise tab", async ({ browser }) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");
  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Mode Seeker") });
  await expandRail(page);

  await page.getByTestId("account-menu-toggle").click();
  const enterpriseTab = page.getByTestId("nav-enterprise-tab");
  await expect(enterpriseTab).toBeVisible({ timeout: 15_000 });
  await expect(enterpriseTab).toHaveText(/Enterprise/);
  await expect(enterpriseTab).toBeDisabled();

  await ctx.close();
});

test("header AI-suggestion chip, when present, reads as well-formed copy", async ({ browser }) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");
  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Chip Seeker") });

  // Suggestion-chip state (staleness / surfaced-match count) isn't fixed for
  // a fresh account, so this only asserts shape when the chip renders, not
  // that it always does.
  const chip = page.getByTestId("ai-suggestion-chip");
  if (await chip.count()) {
    await expect(chip).toHaveText(/Refresh your profile|new match/);
  }
  // The points chip is always present in the header (mockup wording).
  await expect(page.getByTestId("points-balance")).toHaveText(/points$/, { timeout: 15_000 });

  await ctx.close();
});
