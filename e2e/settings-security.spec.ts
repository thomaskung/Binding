import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * /seeker/settings/security (DESIGN.md §13e base + §14j deepening, Phase 6;
 * §2g Phase 10 fills the passkey/recovery-code placeholder with a real
 * enrollment flow; §14e Phase 11 fills the agent/API-token placeholder with
 * a real create/revoke flow) against hosted staging. The Security Command
 * Centre flag panel is real and deterministic (src/lib/security-health.ts).
 *
 * This spec does NOT click through the real passkey enrollment ceremony —
 * Playwright's Chromium virtual authenticator support for the WebAuthn
 * `prf` extension specifically is unconfirmed (see Chromium issue
 * 430804950), a named gap per the Phase 10 spike note in the build plan.
 * It only asserts the real "Enable resume encryption" control renders (not
 * a placeholder) — the crypto plumbing itself is covered without a live
 * ceremony in tests/crypto-envelope.test.ts and e2e/resume-encryption.spec.ts
 * (admin-seeded key). The agent-token card's own create/revoke/consent-gate
 * flow is exercised fully in e2e/agent-mcp.spec.ts — this spec only asserts
 * it renders the real (consent-gated) control, not a placeholder.
 *
 * Modal AI cost: ZERO. Onboards via the free wizard-skip path; nothing here
 * calls an AI provider.
 */

test("Security settings page: flag panel, sign-in methods, passkey control, and agent-token control render", async ({
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

  // Passkey encryption is now a real control (Phase 10) — a fresh seeker
  // hasn't enrolled, so this renders the enable button, not a placeholder.
  // Not clicked here — see the spec's doc comment for why.
  const passkeyCard = page.getByTestId("passkey-placeholder-card");
  await expect(passkeyCard).toBeVisible();
  await expect(passkeyCard.getByTestId("enable-resume-encryption")).toBeVisible();

  // Agent/API-token management is now a real control (Phase 11) — a fresh
  // seeker hasn't granted agent-access consent yet, so this renders the
  // consent-required notice, not a create-token form or a placeholder.
  const agentTokenCard = page.getByTestId("agent-token-placeholder-card");
  await expect(agentTokenCard).toBeVisible();
  await expect(agentTokenCard.getByTestId("agent-access-consent-required")).toBeVisible();

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
  // The AgentTokenCard (Phase 11) also links out to "Privacy settings" when
  // consent isn't granted, so the header cross-link must be scoped to the
  // page header to avoid a strict-mode violation.
  await expect(
    page.locator("header").getByRole("link", { name: "Privacy settings" }),
  ).toHaveAttribute("href", "/seeker/settings/privacy");

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
