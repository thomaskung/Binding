import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * /seeker/settings/privacy (DESIGN.md §13e base + §14j deepening, Phase 6)
 * against hosted staging. Covers: consent-toggle round-trips (same
 * click -> assert -> reload -> re-assert idiom as
 * e2e/connected-accounts-drive.spec.ts's first test), the two un-versioned
 * consent rows (reveal_override_enabled/contact_sharing_consent — no
 * version column, deliberately not in CONSENT_REGISTRY), the tier-gated
 * "who accessed my data" ledger (get_my_access_log() RPC, migration 0028),
 * the DSAR export rate limit, the pause-profile toggle, the
 * delete-original-resume control, and — on the recruiter side — the
 * `hide_name_on_reveal` opt-out toggle on the shared /settings page.
 *
 * Modal AI cost: ZERO. Every test onboards via the free wizard-skip
 * (seeker) or no-first-job-skip (recruiter) path; nothing here calls an AI
 * provider.
 *
 * NOTE: migration 0028 (hide_name_on_reveal, notify_* columns,
 * dsar_last_exported_at, get_my_access_log()) is written but NOT YET applied
 * to hosted staging (see CLAUDE.md Gotchas) — these tests cannot pass for
 * real until `pnpm db:push` lands it; that also means this file is not on
 * `ci.yml`'s PR-gate list yet (touching supabase/migrations/ skips the PR-gate
 * e2e job entirely per its `gate` step — see CLAUDE.md).
 */

test("consent toggles + pause-profile round-trip: click, reload, verify the server actually wrote it", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Pat Privacy") });

  await page.goto("/seeker/settings/privacy");

  // Maintenance consent (existing CONSENT_REGISTRY entry, now rendered from
  // the registry's label/description on this page).
  const maintenanceToggle = page.getByTestId("maintenance-consent-toggle");
  await expect(maintenanceToggle).toBeVisible({ timeout: 30_000 });
  await expect(maintenanceToggle).toHaveAttribute("aria-checked", "false");
  await maintenanceToggle.click();
  await expect(maintenanceToggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("maintenance-consent-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );

  // Notification preference (migration 0028 column) round-trip.
  const notifyToggle = page.getByTestId("notify-product-updates-toggle");
  await expect(notifyToggle).toHaveAttribute("aria-checked", "false");
  await notifyToggle.click();
  await expect(notifyToggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("notify-product-updates-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );

  // Pause-profile toggle (reuses the already-existing profiles.visibility
  // enum, migration 0001 — not a new column).
  const pauseToggle = page.getByTestId("pause-profile-toggle");
  await expect(pauseToggle).toHaveAttribute("aria-checked", "false");
  await pauseToggle.click();
  await expect(pauseToggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("pause-profile-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );

  const admin = stagingAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("visibility, notify_product_updates")
    .eq("id", seeker.id)
    .single();
  expect(profile?.visibility).toBe("paused");
  expect(profile?.notify_product_updates).toBe(true);

  await ctx.close();
});

test("the two un-versioned consent rows (reveal-override, contact-sharing) render and toggle", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Uma Unversioned") });

  await page.goto("/seeker/settings/privacy");

  const overrideToggle = page.getByTestId("override-consent-toggle");
  await expect(overrideToggle).toBeVisible({ timeout: 30_000 });
  await expect(overrideToggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("override-consent-unversioned-label")).toBeVisible();
  await overrideToggle.click();
  await expect(overrideToggle).toHaveAttribute("aria-checked", "true");

  const contactToggle = page.getByTestId("contact-sharing-consent-toggle");
  await expect(contactToggle).toBeVisible();
  await expect(contactToggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("contact-sharing-consent-unversioned-label")).toBeVisible();
  await contactToggle.click();
  await expect(contactToggle).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(page.getByTestId("override-consent-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("contact-sharing-consent-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );

  const admin = stagingAdminClient();
  const { data: consent } = await admin
    .from("consent_flags")
    .select("reveal_override_enabled, contact_sharing_consent")
    .eq("profile_id", seeker.id)
    .single();
  expect(consent?.reveal_override_enabled).toBe(true);
  expect(consent?.contact_sharing_consent).toBe(true);

  await ctx.close();
});

test('"who accessed my data" ledger: company always shown, recruiter name tier-gated + recruiter opt-out honored', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  if (!seeker.id) throw new Error(`ensureStagingUser returned no id for ${seeker.email}`);

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Leslie Ledger") });

  // Admin-seed a synthetic recruiter profile (no real onboarding UI walk
  // needed — pii_access_log's accessor_id just needs a valid profiles row to
  // join against) + a fake pii_access_log row against this seeker.
  const admin = stagingAdminClient();
  const recruiterUser = await ensureStagingUser("recruiter");
  if (!recruiterUser.id) throw new Error(`ensureStagingUser returned no id for ${recruiterUser.email}`);
  const recruiterName = uniqueLabel("Riley Recruiter");
  const companyName = uniqueLabel("Ledger Corp");
  const { error: profileSeedError } = await admin.from("profiles").insert({
    id: recruiterUser.id,
    is_recruiter: true,
    display_name: recruiterName,
    company_name: companyName,
  });
  if (profileSeedError) throw new Error(`recruiter profile seed failed: ${profileSeedError.message}`);

  const { error: logSeedError } = await admin.from("pii_access_log").insert({
    accessor_id: recruiterUser.id,
    accessor_role: "recruiter",
    subject_id: seeker.id,
    resource: "candidate_identity",
    action: "standard_reveal",
  });
  if (logSeedError) throw new Error(`pii_access_log seed failed: ${logSeedError.message}`);

  // Free tier (default): company name shown, recruiter name anonymized.
  await page.goto("/seeker/settings/privacy");
  const row = page.getByTestId("access-log-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("access-log-company-label")).toHaveText(companyName);
  await expect(row.getByTestId("access-log-recruiter-label")).toHaveText("A recruiter");

  // Pro tier: recruiter's real (on-file, honestly-caveated) name now shows.
  await admin.from("profiles").update({ seeker_tier: "pro" }).eq("id", seeker.id);
  await page.reload();
  await expect(
    page.getByTestId("access-log-row").first().getByTestId("access-log-recruiter-label"),
  ).toHaveText(`${recruiterName} (recruiter-provided name, not independently verified)`, {
    timeout: 15_000,
  });

  // Recruiter's own hide_name_on_reveal opt-out overrides Pro-tier disclosure.
  await admin.from("profiles").update({ hide_name_on_reveal: true }).eq("id", recruiterUser.id);
  await page.reload();
  await expect(
    page.getByTestId("access-log-row").first().getByTestId("access-log-recruiter-label"),
  ).toHaveText("A recruiter", { timeout: 15_000 });
  // Company name is never withheld by hide_name_on_reveal.
  await expect(
    page.getByTestId("access-log-row").first().getByTestId("access-log-company-label"),
  ).toHaveText(companyName);

  await ctx.close();
});

test("DSAR export respects its 30-day rate limit: disabled + message shown when already at-cap", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  if (!seeker.id) throw new Error(`ensureStagingUser returned no id for ${seeker.email}`);

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Devon Dsar") });

  // Seed as if an export just happened — well inside the 30-day cooldown.
  const admin = stagingAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ dsar_last_exported_at: new Date().toISOString() })
    .eq("id", seeker.id);
  if (error) throw new Error(`dsar seed failed: ${error.message}`);

  await page.goto("/seeker/settings/privacy");
  const exportButton = page.getByTestId("dsar-export-button");
  await expect(exportButton).toBeVisible({ timeout: 30_000 });
  await expect(exportButton).toBeDisabled();
  await expect(page.getByTestId("dsar-rate-limit-message")).toBeVisible();

  await ctx.close();
});

test("delete-original-resume control actually deletes the resume row", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  if (!seeker.id) throw new Error(`ensureStagingUser returned no id for ${seeker.email}`);

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Remy Resume") });

  // Admin-seed a resume row directly (paste-text shape: storage_path null,
  // so deleteOriginalResume's Storage.remove call has nothing to touch and
  // this test stays zero-cost/zero-external-dependency).
  const admin = stagingAdminClient();
  const { error: seedError } = await admin.from("resumes").insert({
    profile_id: seeker.id,
    storage_path: null,
    raw_text: "e2e-seeded original resume text",
  });
  if (seedError) throw new Error(`resume seed failed: ${seedError.message}`);

  await page.goto("/seeker/settings/privacy");
  await page.getByTestId("delete-original-resume").click();
  await page.getByTestId("confirm-delete-resume").click();
  await expect(page.getByTestId("resume-deleted-badge")).toBeVisible({ timeout: 15_000 });

  const { data: rowsAfter } = await admin
    .from("resumes")
    .select("id")
    .eq("profile_id", seeker.id);
  expect(rowsAfter ?? []).toHaveLength(0);

  await ctx.close();
});

test("recruiter hide_name_on_reveal toggle on /settings round-trips (migration 0028)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  if (!recruiter.id) throw new Error(`ensureStagingUser returned no id for ${recruiter.email}`);

  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, {
    name: uniqueLabel("Hidden Name Recruiter"),
    company: uniqueLabel("Withheld Co"),
  });

  await page.goto("/settings");
  const toggle = page.getByTestId("hide-name-on-reveal-toggle");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("hide-name-on-reveal-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 15_000 },
  );

  const admin = stagingAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("hide_name_on_reveal")
    .eq("id", recruiter.id)
    .single();
  expect(profile?.hide_name_on_reveal).toBe(true);

  await ctx.close();
});
