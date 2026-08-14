import { expect, test, type Page } from "@playwright/test";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { createAndPublishJob, widenMatchFilter } from "./match-helpers";
import { countAiCall, ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Pre-reveal candidate cards never show identity (privacy invariant —
 * `candidateLabel()` in src/lib/candidate-card.ts is deliberately built only
 * from role/region/banded-years, NOT the profile id), so on a shared,
 * never-reset staging DB a plain `.first()` on `recruiter-match-card` risks
 * grabbing a PRIOR run's leftover surfaced-but-never-opted-in candidate
 * instead of this run's — this spec's own seeker deliberately never opts in
 * either, so there is no status-based discriminator (contrast
 * smoke.spec.ts's `.filter({ hasText: "interested" })`, which works because
 * "interested" is unique to that spec's own flow).
 *
 * Fix: embed a run-unique, non-PII token in the résumé/job text (survives
 * redaction — it's not email/phone/year-shaped) and open cards one at a time
 * until the panel's (always-rendered, pre-reveal) "Profile summary" section
 * contains it. Leaves the matching card's panel open for the caller.
 */
async function openCandidatePanelByToken(
  page: Page,
  token: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await widenMatchFilter(page);
    const cards = page.getByTestId("recruiter-match-card");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards.nth(i).click();
      const panel = page.getByTestId("candidate-panel");
      await expect(panel).toBeVisible({ timeout: 15_000 });
      if ((await panel.innerText()).includes(token)) return;
    }
    if (Date.now() > deadline) {
      throw new Error(`no candidate card matched token "${token}" within ${timeoutMs}ms`);
    }
    await page.waitForTimeout(3_000);
    await page.reload();
  }
}

/**
 * Override-reveal economics against hosted staging: fresh seeker + recruiter
 * accounts created per run via `ensureStagingUser` (never the retired local
 * seeded demo accounts), so this spec never depends on (or disturbs) any
 * other run's balances.
 *
 * recruiter onboards (company) -> posts+publishes job -> seeker onboards
 * (consent wizard, resume-first publish) -> does NOT opt in -> paused-profile
 * shield blocks override -> unpaused -> recruiter override-reveals the
 * non-opted-in candidate (name disclosed immediately, messaging locked) ->
 * seeker declines -> recruiter refunded the engagement premium.
 *
 * Match-quality pricing (DESIGN.md §4a, founder directive 2026-08-04) scales
 * both the override cost and the premium refund by the match score
 * (`revealCostForScore` in src/lib/points.ts) — 25/15 are only the BASE
 * points now, not necessarily what's charged. Real Modal embeddings (unlike
 * the local stub) give no a-priori guarantee which pricing tier our job/resume
 * pair lands in, so this spec reads the actual cost/refund the app displays
 * on the override button *before* clicking it, pins it to one of the three
 * legal (cost, refund) pairs the multiplier table allows (with matching tier
 * index), then asserts the recruiter's balance moves by exactly those
 * numbers — this is a STRONGER ledger-math check than a hardcoded 25/15
 * would be, and it stays correct regardless of which pricing tier the real
 * embedding score happens to hit.
 *
 * Modal AI cost, 5 real round-trips: createAndPublishJob (1: ai.embed) +
 * completeSeekerOnboarding's resumeText branch (3: ai.extractProfileFields,
 * counted by the helper itself; plus ai.redact + ai.embed from the
 * onboarding-wizard's "finish" click running publishProfile() — NOT counted
 * by the shared helper's own countAiCall() sites, verified by reading
 * src/app/(app)/seeker/actions.ts rather than trusting its doc comment;
 * counted here instead since the helper's signature/behavior is owned by
 * another agent's conversion) + ai.fitSummary on the override reveal (1).
 */

test("registration wizard + override reveal + decline refund", async ({ browser }) => {
  test.setTimeout(480_000);

  const recruiterCtx = await stagingContext(browser);
  const seekerCtx = await stagingContext(browser);
  const recruiter = await recruiterCtx.newPage();
  const seeker = await seekerCtx.newPage();

  const recruiterUser = await ensureStagingUser("recruiter");
  const seekerUser = await ensureStagingUser("seeker");
  const recruiterName = uniqueLabel("Rita Recruiter");
  const company = uniqueLabel("Nimbus Search Group");
  const seekerName = uniqueLabel("Sam Seeker");

  // Run-unique, non-PII token (not email/phone/year-shaped, so it survives
  // both the client-side paste-path PII strip and the server-side ai.redact
  // pass untouched) baked into the résumé/job text so this run's candidate
  // can be picked out of a shared, never-reset DB — see
  // `openCandidatePanelByToken` above. `uniqueLabel` (not a bare TEST_RUN_ID)
  // so a Playwright retry of this same test within one worker process still
  // gets a fresh token.
  const TOKEN = uniqueLabel("binding-e2e-token");

  // Identical job description / résumé text (as before conversion): near-
  // perfect similarity all but guarantees a surfaced match on any embedding
  // provider, real or stub, regardless of which pricing tier it lands in.
  const RUST_TEXT =
    `Rust systems engineer: async runtimes, tokio, low-latency networking, observability tooling, performance profiling. Ref: ${TOKEN}.`;

  // --- Recruiter registration + job posting ---
  await signIn(recruiter, recruiterUser.email);
  await completeRecruiterOnboarding(recruiter, { name: recruiterName, company });
  await expect(recruiter.getByTestId("points-balance")).toHaveText("100 points");

  const { jobId } = await createAndPublishJob(recruiter, {
    jobTitle: uniqueLabel("Rust Systems Engineer"),
    jobDescription: RUST_TEXT,
    salaryMax: "180000",
    workSetup: "remote",
  });

  // --- Seeker registration: chooser -> consent -> resume-first wizard publish ---
  // The resumeText branch costs 3 Modal calls (extract + publishProfile's
  // redact/embed) and `completeSeekerOnboarding` counts all three itself — do
  // NOT add countAiCall() here or the budget double-counts.
  await signIn(seeker, seekerUser.email);
  await completeSeekerOnboarding(seeker, { name: seekerName, resumeText: RUST_TEXT });

  await seeker.goto("/seeker/profile/resume");
  // 300s: same publishProfile redact+embed behind the finish click above — the
  // preview only renders once both Modal calls land (flake: 180s timeout,
  // 2026-08-13/14 under 4-worker contention on the shared binding-llm engine).
  await expect(seeker.getByTestId("redacted-preview")).toBeVisible({ timeout: 300_000 });

  // Paused-profile shield first (DESIGN §4 guardrail): override toggle ON but
  // visibility paused — recruiter must see the unavailable state, never an
  // override button.
  await seeker.goto("/seeker/profile");
  await seeker.locator('select[name="visibility"]').selectOption("paused");
  await seeker.locator('input[name="reveal_override_enabled"]').check();
  await seeker.getByRole("button", { name: "Save settings" }).click();
  await expect(seeker.getByText("Settings saved.")).toBeVisible();

  // The reveal/override controls + unavailable state live in the detail
  // panel that opens when the candidate's card is clicked.
  await recruiter.goto(`/recruiter/jobs/${jobId}`);
  await recruiter.getByTestId("view-matches").click();
  await openCandidatePanelByToken(recruiter, TOKEN);
  const pausedPanel = recruiter.getByTestId("candidate-panel");
  await expect(pausedPanel.getByText(/Override unavailable: candidate currently unavailable/)).toBeVisible();
  await expect(pausedPanel.getByTestId("override-candidate")).toHaveCount(0);

  // Unpause (override stays allowed) — Privacy card on the profile page.
  await seeker.goto("/seeker/profile");
  await seeker.locator('select[name="visibility"]').selectOption("active");
  await seeker.getByRole("button", { name: "Save settings" }).click();
  await expect(seeker.getByText("Settings saved.")).toBeVisible();

  // Seeker sees the match but does NOT opt in.
  await seeker.goto("/seeker/matches");
  await expect(seeker.getByTestId("seeker-match-card").first()).toBeVisible({ timeout: 120_000 });

  // --- Recruiter override-reveals the non-opted-in candidate ---
  await recruiter.reload();
  await openCandidatePanelByToken(recruiter, TOKEN);

  // Read the ACTUAL price the app is about to charge (match-quality pricing,
  // DESIGN.md §4a, scales both the cost and the refund by the real match
  // score — see revealCostForScore in src/lib/points.ts) before spending it.
  // Pin it to one of the three legal (cost, refund) pairs the multiplier
  // table allows — 25/38/50 and 15/23/30, same tier index on both — rather
  // than trusting the displayed number blindly: this still catches the app
  // charging something the pricing table doesn't allow, while staying
  // correct regardless of which tier the real embedding score lands in.
  const revealPanel = recruiter.getByTestId("candidate-panel");
  const preClickText = await revealPanel.innerText();
  const costMatch = preClickText.match(/Reveal now \((\d+) pts/);
  if (!costMatch?.[1]) {
    throw new Error(`could not parse override cost from candidate panel: ${preClickText}`);
  }

  // The refund/decline terms now live inside the confirmation dialog (Feature
  // 12: reveal-consent moved from always-visible panel text to a Dialog) —
  // open it before parsing the refund figure.
  await revealPanel.getByTestId("override-candidate").click();
  const confirmDialog = recruiter.getByRole("dialog");
  await expect(confirmDialog).toBeVisible({ timeout: 15_000 });
  const dialogText = await confirmDialog.innerText();
  const refundMatch = dialogText.match(/(\d+) pts refund if they decline/);
  if (!refundMatch?.[1]) {
    throw new Error(`could not parse override refund from confirmation dialog: ${dialogText}`);
  }
  const overrideCost = Number(costMatch[1]);
  const premiumRefund = Number(refundMatch[1]);
  const LEGAL_COSTS = [25, 38, 50]; // OVERRIDE_COST(25) x multiplier {1, 1.5, 2}
  const LEGAL_REFUNDS = [15, 23, 30]; // OVERRIDE_PREMIUM_REFUND(15) x multiplier {1, 1.5, 2}
  const tier = LEGAL_COSTS.indexOf(overrideCost);
  expect(tier, `override cost ${overrideCost} not in legal set ${LEGAL_COSTS}`).toBeGreaterThanOrEqual(0);
  expect(premiumRefund, "refund tier must match the cost tier (same score multiplier)").toBe(
    LEGAL_REFUNDS[tier],
  );

  countAiCall(); // ai.fitSummary on override reveal
  await recruiter.getByTestId("confirm-override").click();
  await expect(recruiter.getByTestId("revealed-name")).toHaveText(seekerName, {
    timeout: 120_000,
  });
  await expect(recruiter.getByTestId("override-pending-note")).toBeVisible();
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText(`${100 - overrideCost} points`);

  // --- Seeker sees the pending override card (earned OVERRIDE_COMPENSATION pts) and declines ---
  await seeker.goto("/seeker");
  await expect(seeker.getByTestId("pending-override-card")).toBeVisible();
  await expect(seeker.getByText(`${company} revealed your profile`)).toBeVisible();
  await seeker.getByTestId("override-decline").click();
  await expect(seeker.getByTestId("pending-override-card")).toHaveCount(0);

  // --- Recruiter refunded the engagement premium: charge + refund exactly
  //     what the panel displayed pre-click ---
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText(
    `${100 - overrideCost + premiumRefund} points`,
  );

  await recruiterCtx.close();
  await seekerCtx.close();
});
