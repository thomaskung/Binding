import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Salary stealth completion (DESIGN.md §13a remainder, migration
 * 0025_salary_stealth_band_default.sql): stealth is the default posture,
 * disclosure the opt-in.
 *
 * IMPORTANT — this spec asserts POST-MIGRATION schema (the 'band' enum
 * value, the flipped `salary_visibility`/`share_salary` column defaults) and
 * will fail against hosted staging until 0025 has actually been applied
 * there (`pnpm db:push`, or CI's auto-migrate on merge — see CLAUDE.md
 * Gotchas). It is intentionally NOT added to ci.yml's PR-gate list: that gate
 * already skips the e2e job entirely for PRs touching
 * `supabase/migrations/` (a migration-bearing PR can't be verified against
 * its own preview, since the preview's schema predates the migration — see
 * CLAUDE.md Gotchas), so this file's first real run is the next nightly
 * after this change merges and 0025 lands on staging.
 *
 * Modal AI cost: ZERO. Every job posting here is inserted directly via the
 * admin client and left in `status: 'draft'` — no `publishJob` call, so no
 * embed round-trip. The one browser flow used, recruiter onboarding via
 * `completeRecruiterOnboarding`, is itself zero-AI-cost (see its doc
 * comment in recruiter-onboarding.ts).
 */

test.describe("salary stealth", () => {
  test("job_postings.salary_visibility: 'band' is a valid value, and an unspecified value defaults to on_request (not the old 'public')", async () => {
    test.setTimeout(60_000);
    const admin = stagingAdminClient();
    const recruiter = await ensureStagingUser("recruiter");
    if (!recruiter.id) throw new Error(`ensureStagingUser returned no id for ${recruiter.email}`);

    try {
      const { error: profileErr } = await admin.from("profiles").upsert(
        { id: recruiter.id, is_recruiter: true, display_name: uniqueLabel("Stealth Recruiter") },
        { onConflict: "id" },
      );
      if (profileErr) throw new Error(`profiles upsert failed: ${profileErr.message}`);

      const defaultedTitle = uniqueLabel("Stealth Default Job");
      const bandTitle = uniqueLabel("Stealth Band Job");

      // Row A deliberately OMITS salary_visibility so the column's own
      // default fires — this is the direct schema-level proof that the
      // migration's default flip landed (old default 'public' would fail
      // the assertion below).
      const { data: rowA, error: insertAErr } = await admin
        .from("job_postings")
        .insert({
          recruiter_id: recruiter.id,
          title: defaultedTitle,
          description: "Verifies the salary_visibility column default.",
          salary_min: 150000,
          salary_max: 200000,
        })
        .select("salary_visibility")
        .single();
      if (insertAErr) throw new Error(`job_postings insert (default) failed: ${insertAErr.message}`);
      expect(rowA!.salary_visibility).toBe("on_request");

      // Row B explicitly requests 'band' — proves the enum accepts the new
      // value at all (an unmigrated DB would reject this insert outright).
      const { data: rowB, error: insertBErr } = await admin
        .from("job_postings")
        .insert({
          recruiter_id: recruiter.id,
          title: bandTitle,
          description: "Verifies the 'band' enum value is accepted.",
          salary_min: 182000,
          salary_max: 205000,
          salary_visibility: "band",
        })
        .select("salary_visibility")
        .single();
      if (insertBErr) throw new Error(`job_postings insert (band) failed: ${insertBErr.message}`);
      expect(rowB!.salary_visibility).toBe("band");
    } finally {
      // Cascades job_postings via recruiter_id -> profiles(id) on delete
      // cascade (0001_schema.sql), same as profiles -> auth.users.
      const { error } = await admin.auth.admin.deleteUser(recruiter.id);
      if (error) console.warn(`cleanup: failed to delete staging user ${recruiter.id}: ${error.message}`);
    }
  });

  test("profiles.share_salary defaults to false for a freshly-activated seeker (mirrors activateSeeker's upsert)", async () => {
    test.setTimeout(60_000);
    const admin = stagingAdminClient();
    const seeker = await ensureStagingUser("seeker");
    if (!seeker.id) throw new Error(`ensureStagingUser returned no id for ${seeker.email}`);

    try {
      // Same shape as onboarding/actions.ts's activateSeeker upsert — no
      // share_salary key at all, so a fresh row relies entirely on the
      // column default.
      const { error: upsertErr } = await admin
        .from("profiles")
        .upsert({ id: seeker.id, is_seeker: true, display_name: uniqueLabel("Stealth Seeker") }, { onConflict: "id" });
      if (upsertErr) throw new Error(`profiles upsert failed: ${upsertErr.message}`);

      const { data: row, error: selectErr } = await admin
        .from("profiles")
        .select("share_salary")
        .eq("id", seeker.id)
        .single();
      if (selectErr) throw new Error(`profiles select failed: ${selectErr.message}`);
      expect(row!.share_salary).toBe(false);
    } finally {
      const { error } = await admin.auth.admin.deleteUser(seeker.id);
      if (error) console.warn(`cleanup: failed to delete staging user ${seeker.id}: ${error.message}`);
    }
  });

  test("recruiter Job postings list renders the exact range, coarse band, and stealth copy for public/band/on_request postings respectively", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const admin = stagingAdminClient();
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const recruiter = await ensureStagingUser("recruiter");
    if (!recruiter.id) throw new Error(`ensureStagingUser returned no id for ${recruiter.email}`);

    const publicTitle = uniqueLabel("Stealth Public Posting");
    const bandTitle = uniqueLabel("Stealth Band Posting");
    const onRequestTitle = uniqueLabel("Stealth On-Request Posting");

    try {
      await signIn(page, recruiter.email);
      await completeRecruiterOnboarding(page, {
        name: uniqueLabel("Stealth UI Recruiter"),
        company: uniqueLabel("Stealth UI Co"),
      });

      const { error: insertErr } = await admin.from("job_postings").insert([
        {
          recruiter_id: recruiter.id,
          title: publicTitle,
          description: "Public visibility control case.",
          salary_min: 150000,
          salary_max: 180000,
          salary_visibility: "public",
        },
        {
          recruiter_id: recruiter.id,
          title: bandTitle,
          description: "Coarse band visibility.",
          salary_min: 182000,
          salary_max: 205000,
          salary_visibility: "band",
        },
        {
          recruiter_id: recruiter.id,
          title: onRequestTitle,
          description: "Fully stealth visibility.",
          salary_min: 150000,
          salary_max: 200000,
          salary_visibility: "on_request",
        },
      ]);
      if (insertErr) throw new Error(`job_postings insert failed: ${insertErr.message}`);

      await page.goto("/recruiter/jobs");

      const publicCard = page.locator(".jb-lift", { hasText: publicTitle });
      const bandCard = page.locator(".jb-lift", { hasText: bandTitle });
      const onRequestCard = page.locator(".jb-lift", { hasText: onRequestTitle });

      // Loose (locale-tolerant) match: exact-figure formatting is already
      // pinned by tests/jobs.test.ts's unit assertion — this control case is
      // only here to contrast against the band/on_request cards below, so
      // asserting on Number.prototype.toLocaleString()'s exact separators
      // against a real deployed render would be the one locale-fragile check
      // in this file for no added coverage.
      await expect(publicCard.getByText(/\$150[,.\s]?000\s*–\s*\$180[,.\s]?000/)).toBeVisible();
      await expect(bandCard.getByText("$180k – $220k")).toBeVisible();
      await expect(onRequestCard.getByText("Salary on request")).toBeVisible();
    } finally {
      const { error } = await admin.auth.admin.deleteUser(recruiter.id);
      if (error) console.warn(`cleanup: failed to delete staging user ${recruiter.id}: ${error.message}`);
    }
  });
});
