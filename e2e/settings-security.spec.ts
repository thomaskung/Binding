import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * /seeker/settings/security (DESIGN.md §13e base + §14j deepening, Phase 6)
 * against hosted staging. Kept deliberately light per the founder's brief:
 * the Security Command Centre flag panel is real and deterministic
 * (src/lib/security-health.ts), but passkey/recovery-code and agent/API-token
 * management are explicitly-labeled "Coming soon" placeholders (Phase 10/11)
 * — this spec only asserts the placeholders render as placeholders, it does
 * not exercise functionality that doesn't exist yet.
 *
 * Modal AI cost: ZERO. Onboards via the free wizard-skip path; nothing here
 * calls an AI provider.
 */

test("Security settings page: flag panel, sign-in methods, and Coming-soon placeholders render", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Sam Security") });

  await page.goto("/seeker/settings/security");

  // A fresh magic-link-only account with a confirmed email (e2e users are
  // created via admin.auth.admin.createUser with email_confirm: true) should
  // flag "no additional sign-in method" but NOT "email unverified".
  await expect(page.getByTestId("security-health-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("security-flag-no-additional-signin")).toBeVisible();
  await expect(page.getByTestId("security-flag-email-unverified")).toHaveCount(0);

  await expect(page.getByText(/Signed in via:/)).toBeVisible();

  // Explicitly-labeled placeholders for later phases — real "Coming soon"
  // cards, not functional controls.
  const passkeyCard = page.getByTestId("passkey-placeholder-card");
  await expect(passkeyCard).toBeVisible();
  await expect(passkeyCard.getByText("Coming soon", { exact: false })).toBeVisible();

  const agentTokenCard = page.getByTestId("agent-token-placeholder-card");
  await expect(agentTokenCard).toBeVisible();
  await expect(agentTokenCard.getByText("Coming soon", { exact: false })).toBeVisible();

  // Account deletion stays at /account (not relocated this phase) — this
  // page links to it rather than duplicating the danger-zone control.
  await expect(page.getByRole("link", { name: "Account page" })).toHaveAttribute(
    "href",
    "/account",
  );

  await ctx.close();
});

test("Privacy settings page cross-links to Security settings and vice versa", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Ari Anchor") });

  await page.goto("/seeker/settings/privacy");
  await expect(page.getByRole("link", { name: "Back to your profile" })).toHaveAttribute(
    "href",
    "/seeker/profile",
  );

  await page.goto("/seeker/settings/security");
  await expect(page.getByRole("link", { name: "Privacy settings" })).toHaveAttribute(
    "href",
    "/seeker/settings/privacy",
  );

  // The profile page itself now only links out to the Privacy settings page
  // — the "Privacy" card there is a link card, not the full inline controls
  // (DESIGN.md §13e).
  await page.goto("/seeker/profile");
  await expect(page.getByTestId("privacy-settings-link")).toHaveAttribute(
    "href",
    "/seeker/settings/privacy",
  );

  await ctx.close();
});
