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

  // Regression check only — mirrors signup.spec.ts's "login offers both
  // password and magic-link" test's assertion depth exactly (stop at the
  // button being visible/clickable, don't click through to a real send).
  // That's deliberate, not a missed case: this codebase's convention is
  // @staging.local addresses for e2e users, but those are only ever created
  // server-side via the admin API (staging-helpers.ts) — GoTrue's own
  // signInWithOtp validates the domain on a real send and rejects the
  // `.local` TLD as invalid (confirmed via a real CI run, not assumed). A
  // real-TLD address (e.g. @example.com) would pass that validation but
  // create a pending-signup row cleanup-staging.mjs's cron never sweeps (it
  // only matches @staging.local) — permanent staging pollution, one row per
  // run, for a check this repo has never needed a live send for elsewhere.
  const email = `oauth-regress-${TEST_RUN_ID}@staging.local`;
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();

  // e2e env has NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true, so continuing lands
  // on the password step first, same as signup.spec.ts's
  // "login offers both password and magic-link" test.
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Email me a magic link" })).toBeVisible();
  await ctx.close();
});
