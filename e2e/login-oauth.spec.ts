import { expect, test } from "@playwright/test";
import { stagingContext, TEST_RUN_ID } from "./staging-helpers";

/**
 * OAuth login acceptance tests (DESIGN.md §13h — Google first, Phase 3).
 *
 * This staging project has no Google client ID/secret configured (that's a
 * founder Supabase-dashboard step, not something this environment has —
 * see CLAUDE.md/DESIGN.md §13h), so clicking "Continue with Google" here
 * exercises the real "provider not enabled" path against real staging,
 * not a mock. We deliberately do NOT attempt a real Google OAuth ceremony —
 * there is no way to automate Google's consent screen headlessly and no
 * test credentials exist for it.
 *
 * Modal AI cost: ZERO — /login and the OAuth pre-check
 * (GET /auth/v1/settings) never touch Modal.
 *
 * If Google OAuth is ever actually configured on this staging project, the
 * first assertion below will start failing (the button will instead
 * navigate to Google) — that's a signal to update/remove this test, not a
 * bug in it.
 */

test("Google sign-in shows a friendly message when the provider isn't configured", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  await page.goto("/login", { timeout: 30_000 });
  await expect(page.getByTestId("oauth-google")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("oauth-google").click();

  // Friendly copy from friendlyOAuthError(), not a raw GoTrue JSON error page
  // — and no navigation away from /login.
  await expect(
    page.getByText(
      "Google sign-in isn't set up here yet — continue with your work email instead.",
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login$/);
  await ctx.close();
});

test("magic-link sign-in still works untouched alongside the new Google button", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  await page.goto("/login", { timeout: 30_000 });

  // Regression check only — never asserted on before this spec existed.
  // Unique per-run address; @staging.local users are swept up by the daily
  // cleanup-staging.yml cron regardless of whether the send actually lands.
  const email = `oauth-regress-${TEST_RUN_ID}@staging.local`;
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();

  // e2e env has NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true, so continuing lands
  // on the password step first, same as signup.spec.ts's
  // "login offers both password and magic-link" test.
  await expect(page.getByRole("button", { name: "Email me a magic link" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Email me a magic link" }).click();

  await expect(page.getByText("Check your inbox")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await ctx.close();
});
