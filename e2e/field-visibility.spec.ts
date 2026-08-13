import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { publishMatchingProfile } from "./match-helpers";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Seeker Profile tab's per-field visibility (Phase 2B, src/lib/field-visibility.ts):
 * a "hidden" field must be absent from what recruiters see; a "matching_only"
 * field must ALSO be absent from the recruiter-facing display (it only keeps
 * feeding the match embedding, which isn't observable through the UI — that
 * side is covered by tests/field-visibility.test.ts's pure-function tests).
 * This spec proves the display half through the real publish pipeline.
 *
 * The `redacted-preview` block on /seeker/profile/resume is literally
 * labeled "What recruiters see" in the UI (resume-canvas.tsx) — it's the
 * same redacted text recruiters are shown, so asserting against it from the
 * seeker's own session is a direct test of the recruiter-facing output, no
 * separate recruiter account required.
 *
 * Phase 6 (Security + Privacy settings): the per-field visibility pills
 * moved from /seeker/profile's inline "Privacy" card to the dedicated
 * /seeker/settings/privacy page (src/app/(app)/seeker/settings/privacy-card.tsx)
 * — DESIGN.md §13e "the profile page keeps a link, not the controls". This
 * spec still edits the raw field text on /seeker/profile (unchanged), then
 * navigates to the settings page to cycle visibility, same aria-label/
 * settle-signal contract as before.
 *
 * Runs against hosted staging: opens through `stagingContext(browser)` for
 * the auth-gate headers, creates a fresh seeker via `ensureStagingUser`
 * (no seeded demo account), and reuses the free `wizard-skip` onboarding
 * path. Modal AI cost: exactly TWO round-trips (`ai.redact` + `ai.embed`)
 * from the single `publishMatchingProfile` call — counted internally by
 * that helper, not duplicated here.
 */

test("hidden and matching_only fields are excluded from what recruiters see; visible fields still show", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");

  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Vic Visibility") });

  await page.goto("/seeker/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();

  await page.locator("#skills").fill("Rust, Go");
  await page.locator("#industries").fill("Fintech");
  await page.locator("#desired_roles").fill("Backend Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile fields saved.")).toBeVisible({ timeout: 30_000 });

  // Per-field visibility lives on the dedicated /seeker/settings/privacy
  // page (Phase 6, moved out of the profile page's inline "Privacy" card).
  // Each control is a cycling pill button (settings/privacy-card.tsx
  // VisibilityControl) — click it until its aria-label reports the target
  // mode. Each change persists via a server action — wait for the
  // committed-write signal after each one, or navigating away can cancel
  // the in-flight save.
  await page.goto("/seeker/settings/privacy");
  async function cycleVisibilityTo(label: string, target: string) {
    const button = page.getByLabel(label);
    for (let i = 0; i < 4; i++) {
      if ((await button.getAttribute("aria-label"))?.includes(`${target}.`)) return;
      await button.click();
      await expect(page.getByText("Visibility updated.")).toBeVisible({ timeout: 30_000 });
    }
    throw new Error(`could not cycle ${label} to ${target}`);
  }
  await cycleVisibilityTo("Skills visibility", "Hidden");
  await cycleVisibilityTo("Target industries visibility", "Matching only");

  // Belt-and-suspenders settle check before publishing: the "Visibility
  // updated." toast is a shared status string reused by both pills (it's
  // cleared to null synchronously on each change, then re-set post-commit —
  // see settings/privacy-card.tsx), so a reload-and-assert-persisted-value
  // round trip removes any doubt that BOTH writes actually committed
  // server-side before we navigate away and publish (an in-flight save can
  // be cancelled by navigation, per the comment above).
  await page.reload();
  await expect(page.getByLabel("Skills visibility")).toHaveAttribute("aria-label", /Hidden/);
  await expect(page.getByLabel("Target industries visibility")).toHaveAttribute(
    "aria-label",
    /Matching only/,
  );

  await publishMatchingProfile(page, {
    resumeText:
      "Experienced software engineer focused on distributed systems and cloud infrastructure.",
  });

  const preview = page.getByTestId("redacted-preview");
  await expect(preview).not.toContainText("Rust");
  await expect(preview).not.toContainText("Fintech");
  await expect(preview).toContainText("Backend Engineer");

  await ctx.close();
});
