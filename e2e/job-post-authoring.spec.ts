import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { countAiCall, ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Phase 8 — AI job-post authoring, Paste-JD + Generate modes (DESIGN.md
 * §13b), against hosted staging (real Modal AI). Refine mode already has e2e
 * coverage elsewhere (job-editor's AIDocumentCanvas quick actions) — this
 * spec covers the other two modes only.
 *
 * Stays entirely on `/recruiter/jobs/new` and never saves/publishes, so the
 * only Modal round-trips are the two authoring calls themselves (no
 * `ai.embed` from a save+publish, unlike `createAndPublishJob` in
 * match-helpers.ts). Modal AI cost, 2 real round-trips total:
 *   - extractJobFields (Paste-JD mode)
 *   - generateJob (Generate mode)
 *
 * The second (generate) apply is also the spec's coverage for the
 * "don't silently overwrite filled-in fields" confirm: by the time Generate
 * runs, the form already holds content applied from the Paste-JD draft, so
 * applying the generated draft must first arm the overwrite confirmation
 * rather than clobber it on the first click.
 */
test("Paste-JD extracts fields into a preview; Generate drafts a full posting; both are suggest-and-approve", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiterUser = await ensureStagingUser("recruiter");

  await signIn(page, recruiterUser.email);
  await completeRecruiterOnboarding(page, {
    name: uniqueLabel("Jamie Authoring"),
    company: uniqueLabel("Authoring Search Co"),
  });

  await page.goto("/recruiter/jobs/new");

  // --- Paste-JD mode ---
  // Nothing here is ever saved (save-job/publish-job are never clicked), so
  // unlike most staging-helpers usage there's no later DB query to scope by
  // a unique label — plain strings are fine.
  const pastedJd = [
    "Senior Platform Engineer",
    "Department: Platform Engineering",
    "",
    "Responsibilities:",
    "- Own the core payments ledger service",
    "- Scale distributed systems across regions",
    "",
    "Requirements:",
    "- Strong experience with PostgreSQL and Kubernetes",
    "- Comfortable with System Design at scale",
  ].join("\n");

  await page.getByTestId("job-paste-jd-open").click();
  await expect(page.getByTestId("job-paste-jd-dialog")).toBeVisible();
  await page.getByTestId("job-paste-jd-textarea").fill(pastedJd);

  countAiCall(); // extractJobFields
  await page.getByTestId("job-paste-jd-submit").click();
  // Real Modal round-trip, possible cold start — generous headroom, matching
  // the budget other Modal-touching specs use for a single call.
  await expect(page.getByTestId("job-draft-preview")).toBeVisible({ timeout: 90_000 });

  // No content in the form yet, so applying must go straight through — no
  // overwrite confirmation on this first apply.
  await expect(page.getByTestId("job-draft-overwrite-warning")).toHaveCount(0);
  await page.getByTestId("job-draft-apply").click();
  await expect(page.getByTestId("job-paste-jd-dialog")).toHaveCount(0);

  // Form fields populated from the extracted draft. The model's exact
  // wording isn't pinned (real Modal output varies run to run) — assert the
  // fields were actually filled in, not their literal contents.
  await expect(page.getByTestId("job-title")).not.toHaveValue("");
  await expect(page.getByTestId("job-description")).not.toHaveValue("");
  const titleAfterPaste = await page.getByTestId("job-title").inputValue();
  const descriptionAfterPaste = await page.getByTestId("job-description").inputValue();

  // --- Generate mode ---
  const generatePrompt = "Staff Backend Engineer, fintech, remote";

  await page.getByTestId("job-generate-open").click();
  await expect(page.getByTestId("job-generate-dialog")).toBeVisible();
  await page.getByTestId("job-generate-prompt").fill(generatePrompt);

  countAiCall(); // generateJob
  await page.getByTestId("job-generate-submit").click();
  await expect(page.getByTestId("job-draft-preview")).toBeVisible({ timeout: 90_000 });

  // The form already holds the Paste-JD draft's content, so applying the
  // Generate draft must arm the overwrite confirmation instead of silently
  // clobbering it — the suggest-and-approve safety this phase adds.
  await expect(page.getByTestId("job-draft-overwrite-warning")).toBeVisible();
  const applyButton = page.getByTestId("job-draft-apply");
  await expect(applyButton).toHaveText(/Apply to form/);

  // First click only arms the confirmation. Assert the state transition
  // itself (the label flip) rather than "dialog still visible" — that would
  // already be true before the click and wouldn't prove the click did
  // anything. Checking the dialog is still open AFTER the label has flipped
  // is what actually proves this click armed rather than applied.
  await applyButton.click();
  await expect(applyButton).toHaveText(/Overwrite \d+ filled field/);
  await expect(page.getByTestId("job-generate-dialog")).toBeVisible();

  // Second, explicit click actually applies and closes the dialog.
  await applyButton.click();
  await expect(page.getByTestId("job-generate-dialog")).toHaveCount(0);

  // Form now reflects the generated draft, not the earlier pasted one.
  const titleAfterGenerate = await page.getByTestId("job-title").inputValue();
  const descriptionAfterGenerate = await page.getByTestId("job-description").inputValue();
  expect(titleAfterGenerate).not.toBe("");
  expect(descriptionAfterGenerate).not.toBe("");
  expect(titleAfterGenerate).not.toBe(titleAfterPaste);
  expect(descriptionAfterGenerate).not.toBe(descriptionAfterPaste);

  await ctx.close();
});
