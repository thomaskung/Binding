import { expect, test } from "@playwright/test";

/**
 * App-shell nav rail (NavShell mockup template), seeded demo accounts only:
 * confirms the persistent nav renders on authenticated pages, its links land
 * on the right screens, and the mode switcher exposes the disabled
 * Enterprise tab. The rail starts collapsed (mockup default), so each rail
 * test expands it first via the hamburger toggle.
 */

const SEEKER = { email: "seeker@demo.local", password: "J0B!Demo#2026$secure" };
const RECRUITER = { email: "recruiter@demo.local", password: "J0B!Demo#2026$secure" };

async function signIn(page: import("@playwright/test").Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter)/);
}

async function expandRail(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Expand navigation" }).click();
}

test("seeker nav rail: Job and Benefit land on the right screens", async ({ page }) => {
  await signIn(page, SEEKER);
  await page.waitForURL(/\/seeker$/);
  await expandRail(page);

  await page.getByRole("link", { name: "Job", exact: true }).click();
  await page.waitForURL(/\/seeker\/matches$/);

  await page.getByRole("link", { name: "Benefit", exact: true }).click();
  await page.waitForURL(/\/benefits$/);
  // Shell persists on a non-exemplar page too — nav is still there to leave from.
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("recruiter nav rail: all five items live, no disabled placeholders", async ({ page }) => {
  await signIn(page, RECRUITER);
  await page.waitForURL(/\/recruiter\/jobs$/); // /recruiter redirects to the job list until the pipeline dashboard lands
  await expandRail(page);

  const nav = page.locator("aside nav");
  // Mockup nav: every rail item is a live link — the old Pipeline/Candidates/
  // Team training placeholders are gone.
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByText("Pipeline")).toHaveCount(0);
  await expect(nav.getByText("Candidates")).toHaveCount(0);

  await page.getByRole("link", { name: "Market intel" }).click();
  await page.waitForURL(/\/recruiter\/market-intelligence$/);
  await expect(page.getByRole("link", { name: "Job postings" })).toBeVisible();

  await page.getByRole("link", { name: "Job postings" }).click();
  await page.waitForURL(/\/recruiter\/jobs$/);
});

test("mode switcher exposes a disabled Enterprise tab", async ({ page }) => {
  await signIn(page, SEEKER);
  await page.waitForURL(/\/seeker$/);

  await page.getByTestId("account-menu-toggle").click();
  const enterpriseTab = page.getByTestId("nav-enterprise-tab");
  await expect(enterpriseTab).toBeVisible();
  await expect(enterpriseTab).toHaveText(/Enterprise/);
  await expect(enterpriseTab).toBeDisabled();
});

test("header AI-suggestion chip, when present, reads as well-formed copy", async ({ page }) => {
  await signIn(page, SEEKER);
  await page.waitForURL(/\/seeker$/);

  // Seed state (staleness / surfaced-match count) isn't fixed across reseeds,
  // so this only asserts shape when the chip renders, not that it always does.
  const chip = page.getByTestId("ai-suggestion-chip");
  if (await chip.count()) {
    await expect(chip).toHaveText(/Refresh your profile|new match/);
  }
  // The points chip is always present in the header (mockup wording).
  await expect(page.getByTestId("points-balance")).toHaveText(/points$/);
});
