import { expect, type Page } from "@playwright/test";
import { countAiCall, uniqueLabel } from "./staging-helpers";

/** The recruiter match list defaults its min-match filter to 70%; drag it to
 * the floor (55%) so a stub/real match of any score stays visible. Shared by
 * the smoke + override specs (kept in a non-spec file so importing it doesn't
 * re-register another file's tests).
 *
 * WAITS for the slider (bounded) rather than a single `.count()` check —
 * a one-shot check races client-side hydration on a slow/cold page load and
 * can silently no-op while the slider is still mounting, leaving the 70%
 * floor in effect and hiding a genuine match indefinitely (root-caused a
 * 2026-08-10 post-merge smoke failure: the recruiter's "interested" card was
 * real but below the un-widened floor). Falls back to a no-op if the slider
 * genuinely never appears (e.g. a filter-less view). */
export async function widenMatchFilter(page: Page) {
  const slider = page.getByTestId("filter-min-pct").getByRole("slider");
  try {
    await slider.waitFor({ state: "visible", timeout: 15_000 });
    await slider.press("Home");
  } catch {
    // Not present on this view — no-op, same as the old count()-based check.
  }
}

/** Default matching text pair used by `publishMatchingProfile` /
 * `createAndPublishJob` when a spec doesn't care about the exact wording —
 * only that the two embed close enough to surface a match. This exact pair
 * is empirically proven to clear the real Modal embedding match threshold
 * (staging-functional.spec.ts tests 5/6/7 use the same two strings). Override
 * only when the wording itself is what's under test (e.g. dealbreaker or
 * field-visibility specs) — a hand-written substitute can score below
 * threshold and silently produce zero match rows, which no amount of
 * `widenMatchFilter` will fix. Keep these two strings semantically aligned if
 * you touch one. */
const DEFAULT_MATCHING_RESUME_TEXT =
  "Senior backend engineer: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform serving 2M users.";
const DEFAULT_MATCHING_JOB_DESCRIPTION =
  "Backend engineer: distributed systems, Postgres, Kubernetes, event-driven pipelines for our payments platform.";

/**
 * Publishes a seeker profile via the paste-text path on `/seeker/profile/resume`
 * so it embeds and becomes matchable. Assumes `page` is already signed in as a
 * seeker who has completed onboarding (e.g. via `completeSeekerOnboarding`
 * with no `resumeText` — the free wizard-skip path; this helper is the one
 * that actually publishes/embeds).
 *
 * Does NOT create the account or navigate past onboarding — compose with
 * `ensureStagingUser("seeker")` + `signIn` + `completeSeekerOnboarding`.
 *
 * Ordering contract: EITHER order works against `createAndPublishJob`. Both
 * `publishProfile` and `publishJob` refresh matches on their own side
 * (`refreshMatchesForProfile` / `refreshMatchesForJob`), so a job published
 * before or after this call still produces match rows — smoke.spec.ts does
 * seeker-then-job, override.spec.ts does job-then-seeker, both work.
 *
 * Modal AI cost: TWO round-trips every call (`ai.redact` + `ai.embed`, per
 * `publishProfile` in src/app/(app)/seeker/actions.ts) — this helper calls
 * `countAiCall()` twice itself. THREE if the profile row already has
 * `credentials` set (e.g. via `stagingAdminClient()`), which adds
 * `ai.generalizeCredentials` — call `countAiCall()` once more yourself in
 * that case, this helper can't see that column. There is no cheaper path to
 * a real, embedded, matchable profile; reuse one published profile across
 * assertions rather than calling this more than once per spec.
 */
export async function publishMatchingProfile(
  page: Page,
  opts?: { resumeText?: string },
): Promise<void> {
  await page.goto("/seeker/profile/resume");
  await page.getByTestId("profile-draft").fill(opts?.resumeText ?? DEFAULT_MATCHING_RESUME_TEXT);
  countAiCall(); // ai.redact
  countAiCall(); // ai.embed
  await page.getByTestId("publish-profile").click();
  // Modal redact+embed can cold-start — generous headroom, matching
  // staging-functional.spec.ts's budget for the same round-trip. (Raised
  // 60s -> 90s after a real staging timeout; callers need
  // test.setTimeout(180_000) or higher to stay under playwright.config.ts's
  // 120s default test cap.)
  await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 90_000 });
}

/**
 * Creates and publishes a job posting so it embeds and becomes matchable.
 * Assumes `page` is already signed in as a recruiter who has completed
 * onboarding (e.g. via `completeRecruiterOnboarding`).
 *
 * `jobTitle` defaults to a run-unique label (`uniqueLabel(...)`) — pass your
 * own only if you need a specific title, and make it unique yourself (e.g.
 * with `uniqueLabel` from staging-helpers) so a later assertion can scope to
 * it instead of grabbing `.first()` against a shared, never-reset DB.
 *
 * Ordering contract: EITHER order works against `publishMatchingProfile` —
 * see that function's doc comment; `refreshMatchesForJob` here and
 * `refreshMatchesForProfile` there each independently create the match rows.
 *
 * Modal AI cost: exactly ONE round-trip every call (`ai.embed` on publish,
 * per `publishJob` in src/app/(app)/recruiter/actions.ts — the match refresh
 * itself makes no AI call) — this helper calls `countAiCall()` once itself.
 */
export async function createAndPublishJob(
  page: Page,
  opts?: {
    jobTitle?: string;
    jobDescription?: string;
    salaryMin?: string;
    salaryMax?: string;
    workSetup?: "remote" | "hybrid" | "onsite";
  },
): Promise<{ jobId: string; jobTitle: string }> {
  const jobTitle = opts?.jobTitle ?? uniqueLabel("Backend Engineer, Payments");

  await page.goto("/recruiter/jobs/new");
  await page.getByTestId("job-title").fill(jobTitle);
  await page
    .getByTestId("job-description")
    .fill(opts?.jobDescription ?? DEFAULT_MATCHING_JOB_DESCRIPTION);
  // Both bounds are required since migration 0024 (salary is mandatory at
  // posting time, DESIGN §4a) — fill the min too, or saveJob rejects.
  await page.getByTestId("job-salary-min").fill(opts?.salaryMin ?? "80000");
  await page.getByTestId("job-salary-max").fill(opts?.salaryMax ?? "150000");
  await page.locator(`input[name="work_setups"][value="${opts?.workSetup ?? "remote"}"]`).check();
  await page.getByTestId("save-job").click();
  await page.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]+$/);
  const jobId = new URL(page.url()).pathname.split("/").pop() ?? "";

  countAiCall(); // ai.embed on publish
  await page.getByTestId("publish-job").click();
  // Modal embed can be slow under keep-warm contention — 120s headroom like
  // the seeker publish path (this helper's callers often use 480s budgets).
  await expect(page.getByText("Published — matches refreshed.")).toBeVisible({
    timeout: 120_000,
  });

  return { jobId, jobTitle };
}
