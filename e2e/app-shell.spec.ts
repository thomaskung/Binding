import { expect, test } from "@playwright/test";

/**
 * App-shell nav rail (DESIGN.md-adjacent — see the app-shell plan), seeded
 * demo accounts only: confirms the persistent nav renders on authenticated
 * pages and its real links land on the right screens, plus that backlog
 * placeholders (Pipeline, Candidates, Team training) render disabled.
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

test("seeker nav rail: Job matches and Benefits land on the right screens", async ({ page }) => {
  await signIn(page, SEEKER);
  await page.waitForURL(/\/seeker$/);

  await page.getByRole("link", { name: "Job matches" }).click();
  await page.waitForURL(/\/seeker\?view=matches$/);

  await page.getByRole("link", { name: "Benefits" }).click();
  await page.waitForURL(/\/benefits$/);
  // Shell persists on a non-exemplar page too — nav is still there to leave from.
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("recruiter nav rail: Job postings/Market intelligence real, Pipeline/Candidates/Team training disabled", async ({
  page,
}) => {
  await signIn(page, RECRUITER);
  await page.waitForURL(/\/recruiter$/);

  const nav = page.locator("aside nav");
  await expect(page.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
  await expect(nav.getByText("Pipeline")).toBeVisible();
  await expect(nav.getByText("Candidates")).toBeVisible();
  await expect(nav.getByText("Team training")).toBeVisible();

  await page.getByRole("link", { name: "Market intelligence" }).click();
  await page.waitForURL(/\/recruiter\/market-intelligence$/);
  await expect(page.getByRole("link", { name: "Job postings" })).toBeVisible();

  await page.getByRole("link", { name: "Job postings" }).click();
  await page.waitForURL(/\/recruiter$/);
});
