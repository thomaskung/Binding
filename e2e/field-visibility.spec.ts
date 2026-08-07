import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { publishMatchingProfile } from "./match-helpers";
import { ensureStagingUser, signIn, stagingContext } from "./staging-helpers";

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
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const user = await ensureStagingUser("seeker");

  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: "Vic Visibility" });

  await page.goto("/seeker/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();

  await page.locator("#skills").fill("Rust, Go");
  await page.locator("#industries").fill("Fintech");
  await page.locator("#desired_roles").fill("Backend Engineer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile fields saved.")).toBeVisible();

  // Per-field visibility lives in the Privacy card (always active, not
  // gated behind edit mode). Each change persists via a server action —
  // wait for the committed-write signal after each one, or navigating away
  // can cancel the in-flight save.
  await page.getByLabel("Skills visibility").selectOption("hidden");
  await expect(page.getByText("Visibility updated.")).toBeVisible();
  await page.getByLabel("Target industries visibility").selectOption("matching_only");
  await expect(page.getByText("Visibility updated.")).toBeVisible();

  // Belt-and-suspenders settle check before publishing: the "Visibility
  // updated." toast is a shared status string reused by both selects (it's
  // cleared to null synchronously on each change, then re-set post-commit —
  // see profile-fields.tsx), so a reload-and-assert-persisted-value round
  // trip removes any doubt that BOTH writes actually committed server-side
  // before we navigate away and publish (an in-flight save can be cancelled
  // by navigation, per the comment above).
  await page.reload();
  await expect(page.getByLabel("Skills visibility")).toHaveValue("hidden");
  await expect(page.getByLabel("Target industries visibility")).toHaveValue("matching_only");

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
