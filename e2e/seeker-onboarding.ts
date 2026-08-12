import { expect, type Page } from "@playwright/test";
import { countAiCall } from "./staging-helpers";

/**
 * Shared seeker-onboarding walk for specs that need a fresh seeker account:
 * chooser -> consent gate -> resume-first wizard (paste+extract when
 * `resumeText` is given, wizard-skip otherwise) -> dashboard.
 *
 * The consent gate checks the two REQUIRED consents (processing + automated
 * profiling) — continuous-maintenance consent is OPTIONAL (LEGAL_REVIEW.md
 * Q14) and only checked when a spec opts in via `maintenanceConsent` (the
 * maintenance-nudge spec needs it; everything else leaves it off, matching
 * the real default). NEVER flip `maintenanceConsent` to true just to make a
 * spec pass — it's a distinct legal consent, opt in only when the spec is
 * actually exercising the maintenance-nudge loop.
 *
 * Modal AI cost: the `wizard-skip` path (no `resumeText`) makes ZERO AI
 * calls. Passing `resumeText` costs **THREE** Modal round-trips, and this
 * helper counts all three itself — callers must NOT add their own
 * `countAiCall()` for onboarding:
 *   1. `ai.extractProfileFields` — the extraction wizard step.
 *   2. `ai.redact` and 3. `ai.embed` — fired by the `onboarding-finish` click,
 *      because `finish()` (src/app/onboarding/seeker/profile/onboarding-wizard.tsx)
 *      awaits `publishProfile()`, which redacts and embeds.
 * (Verified against src, not inferred: an earlier version of this comment
 * claimed ONE call and counted one, which silently under-reported the budget
 * by two for every caller.) Prefer the free `wizard-skip` path unless the spec
 * is specifically about the extraction UI (PII stripping, field mapping, etc.).
 *
 * Against a shared, never-reset staging DB, pass `opts.name` as
 * `uniqueLabel("Some Name")` (from staging-helpers.ts) whenever a later
 * assertion will filter/search by that display name (e.g. a recruiter-side
 * `.filter({ hasText: name })` on a match card) — a fixed literal like "Pip
 * Seeker" cross-contaminates concurrent runs against the same DB.
 */
export async function completeSeekerOnboarding(
  page: Page,
  opts: { name: string; resumeText?: string; maintenanceConsent?: boolean },
) {
  await page.waitForURL(/onboarding/);
  await page.getByTestId("choose-seeker").click();
  await page.waitForURL(/onboarding\/seeker/);
  await page.getByTestId("onboard-name").fill(opts.name);
  await page.getByTestId("onboard-tos").check();
  await page.getByTestId("onboard-consent").check();
  await page.getByTestId("onboard-profiling").check();
  if (opts.maintenanceConsent) {
    await page.getByTestId("onboard-maintenance").check();
  }
  await page.getByTestId("onboard-continue").click();
  await page.waitForURL(/onboarding\/seeker\/profile/);

  if (opts.resumeText) {
    await page.getByTestId("onboarding-resume-paste").fill(opts.resumeText);
    countAiCall(); // ai.extractProfileFields
    // Modal round-trip on a possibly-cold lambda — match the 60s headroom
    // staging-functional.spec.ts gives every other AI-backed wait. The extract
    // and finish clicks themselves are Modal boundaries too: give them the
    // same generous action timeout (the button may sit in `pending` while the
    // lambda cold-starts) instead of the 30s Playwright default.
    await page.getByTestId("onboarding-extract").click({ timeout: 90_000 });
    await expect(page.getByTestId("onboarding-continue-dealbreakers")).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByTestId("onboarding-continue-dealbreakers").click({ timeout: 90_000 });
    // finish() awaits publishProfile() → ai.redact + ai.embed. Counted HERE so
    // the cost lives next to the click that causes it and callers can't drift.
    countAiCall(); // ai.redact (publishProfile, via onboarding-finish)
    countAiCall(); // ai.embed  (publishProfile, via onboarding-finish)
    await page.getByTestId("onboarding-finish").click({ timeout: 90_000 });
  } else {
    await page.getByTestId("wizard-skip").click();
  }
  await page.waitForURL(/\/seeker$/, { timeout: 30_000 });
}
