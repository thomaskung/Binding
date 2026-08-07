import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext } from "./staging-helpers";

/**
 * Training home (DESIGN.md §7a) + Benefits catalog (DESIGN.md §7b), against
 * hosted staging: a fresh seeker account (`ensureStagingUser`) is granted
 * training credits directly via the admin client (the credit-bootstrap gap
 * is deliberate — see src/lib/training.ts — so a first credit has to come
 * from somewhere outside the product for this test, same as it would for a
 * real launch promotion). Training programs (migration 0010) and benefit
 * partners (migration 0011) are static seeded product content, not
 * per-environment test data, so they should exist on staging exactly as in
 * local dev once migrations 0010/0011 have run there (CLAUDE.md: CI
 * auto-migrates staging) — no additional seed step is needed here. If that
 * assumption is ever wrong, the bootstrap-grant insert below throws with the
 * real Postgres error instead of failing opaquely. "System Design
 * Fundamentals" is deterministically the first `training-program-card`
 * (page.tsx orders `.order("track").order("credit_cost")`, and it's the
 * cheapest career_path program) and the tier-1 SkyQuest/Harborview partners
 * are seeded with `tier_required: 1`, so `.first()` below is safe against
 * the shared, never-reset DB.
 *
 * complete a personal program (spends credits, earns credits + points) ->
 * assert the flywheel wrote through to both ledgers -> Benefits reflects the
 * new lifetime-points signal -> code reveal shows the no-payment-nexus copy.
 *
 * Modal AI cost: ZERO. Onboarding uses the free wizard-skip path (no
 * `resumeText`, so `completeSeekerOnboarding` makes no AI call) and
 * `completeTrainingProgram` (src/app/(app)/training/actions.ts) makes no AI
 * call either — confirmed by reading that action. This spec doesn't need
 * `countAiCall`/`assertAiCallBudget`.
 */

test("complete a training program, then see the Benefits signal move", async ({ browser }) => {
  // signIn's own email-fill retry budget is 90s and completeSeekerOnboarding's
  // final waitForURL adds another 30s — worst case those alone eat the 120s
  // default before we ever reach /training. Cheap headroom for a test that
  // otherwise passes fast.
  test.setTimeout(240_000);

  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  const seeker = await ensureStagingUser("seeker");
  if (!seeker.id) {
    throw new Error(`ensureStagingUser returned no id for ${seeker.email} — unexpected email collision`);
  }

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: "Tara Trainee" });

  const admin = stagingAdminClient();
  const { error: bootstrapError } = await admin
    .from("training_credits_ledger")
    .insert({ profile_id: seeker.id, event: "earned", amount: 50, note: "e2e bootstrap grant" });
  if (bootstrapError) {
    throw new Error(`training credit bootstrap grant failed: ${bootstrapError.message}`);
  }

  // Cold Vercel lambda + several server-side Supabase queries on first paint —
  // Playwright's default expect timeout (5s) is a local-speed number.
  await page.goto("/training");
  await expect(page.getByTestId("training-program-card").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("complete-program").first().click();
  // completeTrainingProgram does ~6 sequential Supabase round-trips
  // (completion check, program fetch, profile fetch, spend insert, completion
  // insert, two reward-ledger inserts) plus revalidatePath, with no
  // navigation to absorb the latency — give it real headroom.
  await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 45_000 });

  const { data: creditRows } = await admin
    .from("training_credits_ledger")
    .select("event, amount")
    .eq("profile_id", seeker.id)
    .eq("event", "earned")
    .eq("note", "completed: System Design Fundamentals");
  expect(creditRows).toHaveLength(1);
  const { data: pointRows } = await admin
    .from("points_ledger")
    .select("event")
    .eq("profile_id", seeker.id)
    .eq("event", "verified_action");
  expect(pointRows).toHaveLength(1);

  await page.goto("/benefits");
  await expect(page.getByTestId("benefit-tier-badge")).toHaveText("Tier 1", { timeout: 30_000 });
  await page.getByTestId("get-code").first().click();
  await expect(page.getByTestId("benefit-code").first()).toBeVisible();
  await expect(page.getByText("Binding never processes this payment.").first()).toBeVisible();

  await ctx.close();
});
