import { expect, test } from "@playwright/test";
import { createAndPublishJob, publishMatchingProfile } from "./match-helpers";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { countAiCall, ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Recruiter Compare view + bulk reveal + same-role discount against hosted
 * staging (real Modal AI). Two seekers publish the SAME matching résumé text
 * against one job, so both land at the same match-quality tier — this makes
 * the same-role discount arithmetically checkable directly (discounted ===
 * round(full * 0.6)) without needing to know in advance which tier the real
 * embedding lands in (mirrors override.spec.ts's "read the actual displayed
 * price, don't hardcode it" approach).
 *
 * Both candidates are selected and revealed in ONE bulk-reveal call, proving
 * the global-discount claim (every reveal path, not just single-reveal) via
 * the second candidate's rank-2 price rather than a second, separate assertion.
 *
 * Modal AI cost, 7 real round-trips: createAndPublishJob (1: ai.embed) +
 * publishMatchingProfile x2 seekers (2 each: ai.redact + ai.embed = 4) +
 * ai.fitSummary on each of the two bulk-revealed candidates (2, counted
 * inline here — bulkRevealCandidates has no shared helper to count them).
 */
test("Compare view: select two interested candidates, bulk reveal, second gets the same-role discount", async ({
  browser,
}) => {
  test.setTimeout(480_000);

  const recruiterCtx = await stagingContext(browser);
  const seekerACtx = await stagingContext(browser);
  const seekerBCtx = await stagingContext(browser);
  const recruiter = await recruiterCtx.newPage();
  const seekerA = await seekerACtx.newPage();
  const seekerB = await seekerBCtx.newPage();

  const recruiterUser = await ensureStagingUser("recruiter");
  const seekerAUser = await ensureStagingUser("seeker");
  const seekerBUser = await ensureStagingUser("seeker");

  // --- Recruiter: onboard, create + publish one job ---
  await signIn(recruiter, recruiterUser.email);
  await completeRecruiterOnboarding(recruiter, {
    name: uniqueLabel("Cara Compare"),
    company: uniqueLabel("Nimbus Search Group"),
  });
  await expect(recruiter.getByTestId("points-balance")).toHaveText("100 points");
  const { jobId, jobTitle } = await createAndPublishJob(recruiter, {
    jobTitle: uniqueLabel("Compare Bulk Role"),
  });

  // --- Two seekers, identical matching text, both express interest ---
  await signIn(seekerA, seekerAUser.email);
  await completeSeekerOnboarding(seekerA, { name: uniqueLabel("Compare Seeker A") });
  await publishMatchingProfile(seekerA);

  await signIn(seekerB, seekerBUser.email);
  await completeSeekerOnboarding(seekerB, { name: uniqueLabel("Compare Seeker B") });
  await publishMatchingProfile(seekerB);

  for (const seeker of [seekerA, seekerB]) {
    await seeker.goto("/seeker/matches");
    // Filter by this run's own job title, not .first() — on a shared,
    // never-reset staging DB, real embeddings mean a seeker's résumé can
    // match many leftover jobs from past runs (see smoke.spec.ts's fix for
    // the same bug class, a real 2026-08-10 post-merge smoke failure).
    const matchCard = seeker.getByTestId("seeker-match-card").filter({ hasText: jobTitle }).first();
    await expect(matchCard).toBeVisible({ timeout: 60_000 });
    await matchCard.getByTestId("match-interested").click();
    await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({ timeout: 15_000 });
  }

  // --- Recruiter: Compare tab, select both interested candidates ---
  await recruiter.goto(`/recruiter/jobs/${jobId}`);
  await recruiter.getByTestId("view-matches").click();
  await recruiter.getByTestId("matches-view-compare").click();

  const compareCards = recruiter.getByTestId("compare-candidate-card").filter({ hasText: "interested" });
  await expect(compareCards).toHaveCount(2, { timeout: 60_000 });
  for (let i = 0; i < 2; i++) {
    await compareCards.nth(i).getByTestId("compare-select-toggle").click();
  }

  await recruiter.getByTestId("compare-reveal-selected").click();
  await expect(recruiter.getByTestId("compare-confirm-dialog")).toBeVisible({ timeout: 15_000 });

  // --- Preview: authoritative pre-charge cost, one full price + one discounted ---
  const previewCosts = await recruiter.getByTestId("compare-preview-cost").allTextContents();
  expect(previewCosts).toHaveLength(2);
  const previewNums = previewCosts.map((c) => Number(c.replace(/[^\d]/g, "")));
  const full = Math.max(previewNums[0]!, previewNums[1]!);
  const discounted = Math.min(previewNums[0]!, previewNums[1]!);
  expect([10, 15, 20], `unexpected base tier cost ${full}`).toContain(full);
  expect(discounted, "rank-2 cost must be round(full * 0.6) — the same-role discount").toBe(
    Math.round(full * 0.6),
  );
  const totalCost = full + discounted;
  await expect(recruiter.getByTestId("compare-preview-total")).toHaveText(`${totalCost} pts`);

  // --- Commit: two real reveals, one at full price, one discounted ---
  countAiCall(); // ai.fitSummary, first bulk-revealed candidate
  countAiCall(); // ai.fitSummary, second bulk-revealed candidate
  await recruiter.getByTestId("compare-confirm-reveal").click();
  const outcomes = recruiter.getByTestId("compare-outcome");
  await expect(outcomes).toHaveCount(2, { timeout: 60_000 });
  const outcomeTexts = await outcomes.allTextContents();
  for (const text of outcomeTexts) expect(text).toMatch(/^revealed — \d+ pts$/);

  await recruiter.getByTestId("compare-confirm-done").click();
  await expect(recruiter.getByTestId("compare-confirm-dialog")).toHaveCount(0);

  // --- Balance moved by exactly what the preview showed, on the SAME reveal path
  //     used everywhere else in the app — proves the discount is global, not
  //     Compare-only ---
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText(`${100 - totalCost} points`);

  await recruiterCtx.close();
  await seekerACtx.close();
  await seekerBCtx.close();
});
