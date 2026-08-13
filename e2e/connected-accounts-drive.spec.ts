import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Google Drive connected-account import (DESIGN.md §14a minimal slice,
 * Phase 4) against hosted staging. There is deliberately NO real OAuth
 * ceremony here — Google's consent screen cannot be driven headlessly, same
 * reasoning as the Phase 3 login-OAuth spec — so this spec never visits
 * /api/connected-accounts/google-drive/authorize or /callback. Instead:
 *
 *  - The "not connected yet" path exercises the real consent toggle
 *    (`connected_accounts_opt_in_at`, migration 0027) and asserts the
 *    resulting Connect-Drive link's href, without ever clicking it (that
 *    would leave the page and try to reach real Google).
 *  - The "connected" path admin-seeds a fake `connected_accounts` row
 *    directly (service-role client, bypassing the OAuth dance entirely) so
 *    the server-rendered `driveConnected` prop flips true, then intercepts
 *    the client-side fetch to /api/connected-accounts/google-drive/files
 *    with `page.route` — a same-origin request the browser never actually
 *    sends anywhere near Google. The spec stops at the file list; it never
 *    clicks "Import" (src/app/api/connected-accounts/google-drive/import
 *    would need its own mock and isn't exercised here — the file-list view
 *    is the acceptance surface this slice ships).
 *
 * Modal AI cost: ZERO. Both tests onboard via the free wizard-skip path (no
 * `resumeText`), and nothing else in this spec calls an AI provider.
 */

test("Drive not connected: consent toggle reveals a Connect-Drive link, resume page shows the hint", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  const seeker = await ensureStagingUser("seeker");
  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Dana Drive") });

  await page.goto("/seeker/profile");
  const toggle = page.getByTestId("connected-accounts-toggle");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("connect-google-drive")).toHaveCount(0);

  await toggle.click();
  // This click sets React state optimistically before the server action
  // resolves — assert on it, then reload to prove the write actually landed
  // in `consent_flags.connected_accounts_opt_in_at` (migration 0027) rather
  // than only checking client-side state that would look identical even if
  // the server action had silently thrown (e.g. the migration missing).
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("connected-accounts-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );
  const connectLink = page.getByTestId("connect-google-drive");
  await expect(connectLink).toBeVisible();
  await expect(connectLink).toHaveAttribute(
    "href",
    "/api/connected-accounts/google-drive/authorize",
  );

  // Resume canvas: not connected yet (only consent was granted, no
  // connected_accounts row exists) — the hint link shows, not the browse
  // button.
  await page.goto("/seeker/profile/resume");
  await expect(page.getByTestId("drive-connect-hint")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("browse-google-drive")).toHaveCount(0);

  await ctx.close();
});

test("Drive connected: resume canvas lists recent files from a stubbed Drive API", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  const seeker = await ensureStagingUser("seeker");
  if (!seeker.id) {
    throw new Error(`ensureStagingUser returned no id for ${seeker.email} — unexpected email collision`);
  }
  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Riley Reader") });

  // Admin-seed a fake connected_accounts row directly — no real OAuth
  // ceremony. Token values are dummy/never sent anywhere real: the only
  // network call that would use them (GET .../files) is intercepted below
  // before it leaves the browser.
  const admin = stagingAdminClient();
  const { error: seedError } = await admin.from("connected_accounts").insert({
    profile_id: seeker.id,
    provider: "google_drive",
    access_token: "e2e-fake-access-token",
    refresh_token: "e2e-fake-refresh-token",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    scope: "https://www.googleapis.com/auth/drive.readonly",
  });
  if (seedError) {
    throw new Error(`connected_accounts seed failed: ${seedError.message}`);
  }

  const fixtureFile1 = {
    id: "e2e-file-1",
    name: uniqueLabel("Resume") + ".pdf",
    mimeType: "application/pdf",
    modifiedTime: new Date().toISOString(),
  };
  const fixtureFile2 = {
    id: "e2e-file-2",
    name: uniqueLabel("CV Doc"),
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: new Date().toISOString(),
  };
  await page.route("**/api/connected-accounts/google-drive/files", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: [fixtureFile1, fixtureFile2] }),
    });
  });

  await page.goto("/seeker/profile/resume");
  const browseButton = page.getByTestId("browse-google-drive");
  await expect(browseButton).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("drive-connect-hint")).toHaveCount(0);

  await browseButton.click();
  await expect(page.getByTestId("drive-file-picker")).toBeVisible();
  const rows = page.getByTestId("drive-file-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: fixtureFile1.name })).toBeVisible();
  await expect(rows.filter({ hasText: fixtureFile2.name })).toBeVisible();

  // Stop here — never clicks "Import". See module doc comment.

  await ctx.close();
});
