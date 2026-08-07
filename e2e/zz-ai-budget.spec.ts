import { test } from "@playwright/test";
import { assertAiCallBudget } from "./staging-helpers";

/**
 * Suite-wide Modal spend gate. Deliberately named `zz-` so it sorts LAST:
 * Playwright runs spec files in path order and `playwright.config.ts` pins
 * `workers: 1, fullyParallel: false`, so by the time this file executes,
 * every other spec's `countAiCall()` has already run.
 *
 * The counter itself is DISK-BACKED (`e2e/staging-helpers.ts`, one line
 * appended per call to `aiCounterFile()`), not a module-level variable, and
 * that matters here specifically: Playwright discards the worker process
 * after a test failure and starts a fresh one, which re-imports every spec
 * module and resets module-level `let`s back to their initializers. A naive
 * in-memory counter would silently zero itself on the very first failure in
 * the run, and this suite-wide check would then pass green having "seen"
 * only the calls made after the last restart — worse than not checking at
 * all, because it looks like a real gate. A file on disk survives the
 * restart that a JS variable doesn't, which is why this file's assertion is
 * trustworthy even on a suite that had retries/failures earlier.
 *
 * Why this file exists rather than a `test.afterAll` somewhere:
 * `staging-functional.spec.ts` used to be the only place `assertAiCallBudget()`
 * ran, and an `afterAll` fires at the end of ITS file — so it structurally
 * could not observe calls made by files scheduled after it (staging-uat,
 * training-benefits). The suite was spending 27 Modal calls while the assertion
 * only ever saw 24 and passed green. That is not an ordering accident to be
 * fixed by renaming files; a per-file `afterAll` can never guard a whole suite
 * — it can't see spec files that run after it, disk-backed or not.
 *
 * A `globalTeardown` still can't do this job either, even now that the
 * counter is disk-backed: it runs once in Playwright's main process (same as
 * `global-setup.ts`), not inside a worker, and a thrown error there does not
 * fail the run the way a failing `test()` does — it is reported as a setup/
 * teardown error, not a test result, which is a worse signal for a "the
 * suite spent too much real money" gate than a normal red test. This file
 * gets the ordering guarantee for free by being a spec: it only runs after
 * every prior spec file has finished, in the same path order Playwright
 * already uses to run everything else.
 *
 * Consequence to keep in mind: this only guards a FULL-suite run. Running a
 * single spec by path (as the nightly `functional` job does) never reaches this
 * file — `staging-functional.spec.ts` keeps its own `afterAll` assertion so that
 * path still has a ceiling.
 */
test("Modal AI call budget not exceeded across the whole suite", () => {
  assertAiCallBudget();
});
