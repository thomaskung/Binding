import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Fewer-fields progressive disclosure on the seeker profile edit form
 * (Phase 7, DESIGN.md §13c, src/lib/profile-field-disclosure.ts): the
 * essential-group fields (skills, desired roles, industries, work
 * experience, display name) render immediately in edit mode; the
 * advanced-group fields (headline, phone, location, credentials, references,
 * share-salary) collapse behind a "Show more fields" toggle
 * (`advanced-fields-toggle`).
 *
 * UI-only, zero Modal cost: uses the free `wizard-skip` onboarding path
 * (no `resumeText`) and never publishes, so no `countAiCall()` needed.
 */

test("essential fields show immediately; advanced fields disclose on demand and survive collapse", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");

  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Penny Progressive") });

  await page.goto("/seeker/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();

  // Essential fields are visible right away, with no expansion.
  await expect(page.locator("#display_name")).toBeVisible();
  await expect(page.locator("#skills")).toBeVisible();
  await expect(page.locator("#desired_roles")).toBeVisible();
  await expect(page.locator("#industries")).toBeVisible();

  // Advanced fields are not yet in the DOM, and the toggle offers to reveal them.
  const toggle = page.getByTestId("advanced-fields-toggle");
  await expect(toggle).toHaveText(/Show more fields/);
  await expect(page.locator("#headline")).toHaveCount(0);
  await expect(page.locator("#phone")).toHaveCount(0);
  await expect(page.getByTestId("credentials-input")).toHaveCount(0);

  // Expand: advanced fields appear.
  await toggle.click();
  await expect(toggle).toHaveText("Show fewer fields");
  await expect(page.locator("#headline")).toBeVisible();
  await expect(page.locator("#phone")).toBeVisible();
  await expect(page.getByTestId("credentials-input")).toBeVisible();

  // Set values in advanced fields, then re-collapse the section before saving
  // — this must not lose the in-progress edits (pure UI disclosure, not a
  // data-loss toggle).
  const headlineValue = uniqueLabel("Staff Engineer");
  await page.locator("#headline").fill(headlineValue);
  await page.getByTestId("credentials-input").fill("AWS Solutions Architect Pro");

  await toggle.click();
  await expect(toggle).toHaveText(/Show more fields/);
  await expect(page.locator("#headline")).toHaveCount(0);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile fields saved.")).toBeVisible({ timeout: 30_000 });

  // Reload and confirm the collapsed-while-editing values actually persisted.
  await page.reload();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByTestId("advanced-fields-toggle").click();
  await expect(page.locator("#headline")).toHaveValue(headlineValue);
  await expect(page.getByTestId("credentials-input")).toHaveValue("AWS Solutions Architect Pro");

  await ctx.close();
});
