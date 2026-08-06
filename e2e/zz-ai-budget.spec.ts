import { test } from "@playwright/test";
import { assertAiCallBudget } from "./staging-helpers";

/**
 * Suite-wide Modal spend gate. Deliberately named `zz-` so it sorts LAST:
 * Playwright runs spec files in path order and `playwright.config.ts` pins
 * `workers: 1, fullyParallel: false`, so by the time this file executes the
 * module-level counter in `staging-helpers.ts` has seen every other spec's
 * `countAiCall()`.
 *
 * Why this file exists rather than a `test.afterAll` somewhere:
 * `staging-functional.spec.ts` used to be the only place `assertAiCallBudget()`
 * ran, and an `afterAll` fires at the end of ITS file — so it structurally
 * could not observe calls made by files scheduled after it (staging-uat,
 * training-benefits). The suite was spending 27 Modal calls while the assertion
 * only ever saw 24 and passed green. That is not an ordering accident to be
 * fixed by renaming files; a per-file hook can never guard a whole suite.
 *
 * A `globalTeardown` can't do this either: it runs in the main process, while
 * specs run in a worker, so it cannot read the worker's module state.
 *
 * Consequence to keep in mind: this only guards a FULL-suite run. Running a
 * single spec by path (as the nightly `functional` job does) never reaches this
 * file — `staging-functional.spec.ts` keeps its own `afterAll` assertion so that
 * path still has a ceiling.
 */
test("Modal AI call budget not exceeded across the whole suite", () => {
  assertAiCallBudget();
});
