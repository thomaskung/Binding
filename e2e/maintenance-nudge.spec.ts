import { expect, test } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { publishMatchingProfile } from "./match-helpers";
import {
  countAiCall,
  ensureStagingUser,
  signIn,
  stagingAdminClient,
  stagingContext,
} from "./staging-helpers";

/**
 * Adaptive dashboard's stale frame (DESIGN.md §2d) + the maintenance-nudge
 * suggest-and-approve loop (DESIGN.md §2c), against hosted staging: a fresh
 * seeker is created via `ensureStagingUser` and opts IN to the OPTIONAL
 * maintenance consent at onboarding (every other spec leaves it off — this
 * is the one that exercises the consented loop; see the doc comment on
 * `completeSeekerOnboarding`). The profile is published via the free
 * `publishMatchingProfile` helper, then its `last_profile_activity_at` is
 * backdated directly through `stagingAdminClient()` — staging has no
 * db:reset and no product surface can fast-forward 90 days, so this is the
 * only way to force the stale state deterministically.
 *
 * publish -> backdate activity -> dashboard shows the stale nudge card ->
 * follow it -> answer -> draft -> approve -> profile republishes, staleness
 * clears, dashboard falls back to the normal matches view, and the
 * freshness-confirmation point award (BUSINESS.md §3/§6a) lands exactly
 * once, verified both via the points ledger and the header's points-balance
 * chip (10 seed + 3 freshness = 13 — a positive, self-scoped signal that the
 * dashboard actually finished re-rendering, not just navigated).
 *
 * Modal AI cost: FIVE round-trips total — `publishMatchingProfile`'s
 * `ai.redact` + `ai.embed` (2, counted internally by that helper),
 * `requestMaintenanceDraft`'s `ai.draftMaintenanceUpdate` (1, counted here),
 * and `acceptMaintenanceUpdate`'s republish, which calls `publishProfile` a
 * second time — `ai.redact` + `ai.embed` again (2, counted here). Report 5
 * to the orchestrator against the CI-enforced budget.
 */

test("stale profile nudges, and approving the draft clears staleness", async ({ browser }) => {
  // This spec drives FIVE real Modal round-trips (publish 2 + draft 1 +
  // republish 2), and `publishMatchingProfile` alone waits up to 90s for
  // redact+embed. playwright.config.ts caps tests at 120s globally, so without
  // this raise a single cold publish would blow the whole test's budget before
  // the nudge loop even starts — a worse failure mode than the 60s wait it
  // replaced, because the error would point at the test timeout rather than at
  // the slow Modal call.
  test.setTimeout(300_000);

  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  const user = await ensureStagingUser("seeker");
  if (!user.id) throw new Error(`ensureStagingUser returned no id for ${user.email} (email collision)`);

  await signIn(page, user.email);
  // Opts IN to maintenance consent at onboarding — this spec exercises the
  // consented nudge loop; the JIT-consent prompt path is covered separately.
  await completeSeekerOnboarding(page, { name: "Nadia Nudge", maintenanceConsent: true });
  await publishMatchingProfile(page);

  // No product surface can fast-forward 90 days — backdate directly.
  const admin = stagingAdminClient();
  await admin
    .from("profiles")
    .update({ last_profile_activity_at: new Date(Date.now() - 100 * 86_400_000).toISOString() })
    .eq("id", user.id);

  await page.goto("/seeker");
  await expect(page.getByTestId("stale-nudge-card")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("stale-nudge-card").getByRole("button", { name: "Draft update" }).click();
  await page.waitForURL(/\/seeker\/nudge/);

  await page.getByTestId("nudge-answer").fill("Shipped a new fraud-detection pipeline this quarter.");
  await page.getByTestId("nudge-draft").click();
  countAiCall(); // ai.draftMaintenanceUpdate
  // Modal round-trip on a possibly-cold lambda — same 60s headroom as the
  // other AI-backed waits in the shared helpers.
  await expect(page.getByTestId("nudge-suggestion")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("nudge-approve").click();
  countAiCall(); // acceptMaintenanceUpdate -> publishProfile: ai.redact
  countAiCall(); // acceptMaintenanceUpdate -> publishProfile: ai.embed
  await page.waitForURL(/\/seeker$/, { timeout: 120_000 });

  await expect(page.getByTestId("stale-nudge-card")).toHaveCount(0);
  // Positive signal (not just an absence) that the dashboard actually
  // finished re-rendering post-republish, scoped to this test's own seeker:
  // 10-pt onboarding seed + 3-pt freshness confirmation.
  await expect(page.getByTestId("points-balance")).toHaveText("13 points", { timeout: 15_000 });

  // Freshness-confirmation earning (BUSINESS.md §3/§6a) — approving a real
  // suggest-and-approve update earns points, rate-limited to once per
  // cooldown window (src/lib/points.ts earnFreshnessConfirmation).
  const { data: pointRows } = await admin
    .from("points_ledger")
    .select("event, amount")
    .eq("profile_id", user.id)
    .eq("event", "verified_action")
    .eq("note", "freshness confirmation");
  expect(pointRows).toHaveLength(1);
  expect(pointRows?.[0]?.amount).toBe(3);

  await ctx.close();
});
