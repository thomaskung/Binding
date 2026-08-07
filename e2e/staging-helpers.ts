import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

export const TEST_RUN_ID = Date.now().toString(36);
const PASSWORD = "J0B!Demo#2026$secure";

let _labelCounter = 0;

/**
 * Collision-safe label for anything a spec writes into a shared, never-reset
 * staging DB — job titles, seeker/recruiter display names, company names,
 * etc. Appends the module-wide TEST_RUN_ID plus an incrementing counter, so
 * every call within one Playwright *process* is guaranteed unique, even two
 * requested in the same millisecond. Prefer this over hand-rolled
 * `Date.now()` suffixes — two of those in the same millisecond DO collide.
 *
 * Uniqueness is per-process, not per-run: playwright.config.ts pins
 * `workers: 1`, so today there is exactly one process per suite invocation
 * and labels are unique suite-wide. If that ever changes to >1 worker,
 * TEST_RUN_ID (Date.now() at module load) could repeat across workers
 * started in the same millisecond — revisit then (e.g. add pid/worker index).
 *
 * Use it for anything a later assertion filters/searches by (e.g.
 * `.filter({ hasText: name })`) — never reuse a fixed literal like "Pip
 * Seeker" across specs that might run concurrently against the same DB.
 */
export function uniqueLabel(prefix: string): string {
  _labelCounter++;
  return `${prefix} ${TEST_RUN_ID}-${_labelCounter}`;
}

/**
 * Guard for module-level `let` fixtures shared across tests in one spec file
 * (e.g. `let pipelineSeekerEmail = ""` set in an early test, read by later
 * ones). Playwright discards the worker process after a test failure and
 * starts a fresh one, which re-imports the spec module and resets every
 * such `let` back to its initializer — so a later test can silently receive
 * `""` instead of the value an earlier (now-forgotten) test produced. Call
 * this at the point of use so the failure names the real fixture and points
 * at the real cause, instead of surfacing 90s later as a mystery UI timeout.
 */
export function requireFixture(value: string | null | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(
      `${name} is empty — a shared test fixture was not initialised. Playwright ` +
        "discards the worker process after a test failure, which resets module-level " +
        "state in spec files.",
    );
  }
  return value;
}

// Modal budget guardrail. Tests that trigger a Modal round-trip call
// `countAiCall()`; `assertAiCallBudget()` asserts the total so a new test can't
// silently inflate real Modal spend. The counter is DISK-BACKED (one line
// appended per call to `aiCounterFile()`), not module state: Playwright
// discards the worker process after a test failure and starts a fresh one,
// which re-imports every spec module and resets module-level `let`s —
// including a naive in-memory counter — back to zero. `workers: 1` only
// guarantees one *process at a time*, not one process for the whole run, so
// it does NOT make a module-level counter suite-wide; a file on disk survives
// the restart that a JS variable doesn't. `e2e/global-setup.ts` deletes the
// file once at the start of the run so every invocation starts at zero.
//
// Asserted from `e2e/zz-ai-budget.spec.ts`, which sorts LAST so it observes the
// whole suite. (Previously the only assertion lived in staging-functional's
// `test.afterAll`, which fires at the end of THAT file and therefore could never
// see staging-uat's calls — the suite spent 27 while the check saw 24 and passed
// green. A per-file hook cannot guard a whole suite; don't move it back.)
//
// Raised 8 → 27 on 2026-08-06, when the whole suite moved to hosted staging:
// local runs used AI_PROVIDER=stub (free), so every one of these is now a REAL
// PAID call, and ci.yml runs the full suite on every PR. Measured, file by file:
//   field-visibility ......... 2   (publishMatchingProfile: redact+embed)
//   maintenance-nudge ........ 5   (publish 2 + draft 1 + republish 2)
//   no-third-party ........... 2   (publishMatchingProfile)
//   override ................. 5   (job embed 1 + onboarding-with-resume 3 + fitSummary 1)
//   smoke .................... 4   (publish 2 + job embed 1 + fitSummary 1)
//   staging-functional ....... 6   (tests 5/6/8/11/18; the rest reuse the
//                                   pipeline's existing profile+job)
//   staging-uat .............. 3   (scenario 1 only: publish 2 + job embed 1;
//                                   scenarios 3/5/7 reuse that fixture free)
//   app-shell, signup, recruiter-onboarding-wizard, training-benefits,
//   market-intel-dimensions .. 0   (wizard-skip onboarding / SQL-only RPCs)
//   ------------------------------
//   TOTAL .................... 27
// Keep it a tight ceiling: if a change pushes the real total up, re-measure and
// justify the new number here rather than bumping it to make a run go green.
export const AI_CALL_BUDGET = 27;

/** Resolves the on-disk counter file path. Exported so `global-setup.ts` can
 * delete the same file at the start of a run without duplicating the literal. */
export function aiCounterFile(): string {
  return process.env.E2E_AI_COUNTER_FILE ?? path.join(process.cwd(), "test-results", "ai-calls.log");
}

export function countAiCall() {
  // Retried attempts are NOT counted against the budget. The nightly runs
  // `npx playwright test --retries=1`, so one flaky Modal-touching test
  // re-spends its calls on the second attempt — override and maintenance-nudge
  // are 5 calls each. Counting those would let a transient staging hiccup trip
  // the ceiling and read as "someone added Modal round-trips", which is the
  // exact false signal this guard exists to avoid. The budget measures what the
  // SUITE COSTS BY DESIGN; retry spend is real money but it is runtime noise,
  // not a code regression, so it belongs in the log rather than the assertion.
  //
  // `test.info()` throws when called outside a running test, so this is
  // best-effort: if we cannot tell, we count (fail toward enforcing the budget).
  try {
    if (test.info().retry > 0) return;
  } catch {
    // Not inside a test — fall through and count.
  }

  const file = aiCounterFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Sync append: a worker that crashes/exits immediately after the Modal call
  // that triggered this must not lose the write, so no buffered/async I/O.
  fs.appendFileSync(file, "1\n");
}

export function assertAiCallBudget(): void {
  const file = aiCounterFile();
  const calls = fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter((line) => line.trim().length > 0).length
    : 0;
  if (calls > AI_CALL_BUDGET) {
    throw new Error(
      `Modal AI call budget exceeded: ${calls} > ${AI_CALL_BUDGET}. ` +
        "Trim AI round-trips in the staging functional suite.",
    );
  }
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

let _admin: SupabaseClient | null = null;
let _userCounter = 0;

export function stagingAdminClient(): SupabaseClient {
  if (!_admin) {
    const url = env("E2E_SUPABASE_URL");
    const key = env("E2E_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("E2E_SUPABASE_URL and E2E_SERVICE_ROLE_KEY must be set");
    _admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return _admin;
}

export async function ensureStagingUser(role: "seeker" | "recruiter"): Promise<{ email: string; id: string }> {
  const admin = stagingAdminClient();
  _userCounter++;
  const email = `test-${TEST_RUN_ID}-${role}-${_userCounter}@staging.local`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user) return { email, id: data.user.id };
    if (error?.code === "email_exists") return { email, id: "" }; // caller should handle
    if (attempt === 5) throw new Error(`ensureStagingUser failed: ${error?.message}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("unreachable");
}

/**
 * Fill the login email and wait for the Continue button to enable. React 19
 * hydration can reset a controlled input right after fill (value snaps back to
 * "" and the button stays disabled) on cold staging instances. The only signal
 * that matters is the button enabling — keep refilling until React has the
 * value, up to a generous budget.
 */
async function fillEmailAndEnableContinue(page: Page, email: string) {
  const deadline = Date.now() + 90_000;
  let reloads = 0;
  while (Date.now() < deadline) {
    // Re-resolve locators each pass — a reload (below) swaps the DOM.
    const input = page.getByLabel("Work email");
    const continueBtn = page.getByRole("button", { name: "Continue with email" });
    await input.fill(email).catch(() => {});
    try {
      await expect(continueBtn).toBeEnabled({ timeout: 4_000 });
      return;
    } catch {
      // The value snapped back (hydration) or the lambda is still cold. A full
      // reload kicks a fresh hydration pass and usually clears it faster than
      // repeated refills — bounded so a genuinely broken page still fails.
      if (reloads < 6) {
        reloads++;
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
  }
  throw new Error(`email fill did not stick within 90s`);
}

export async function signIn(page: Page, email: string) {
  // Fail fast, before any page interaction: a blank email means a shared
  // module-level fixture (e.g. `let pipelineSeekerEmail = ""`) was never set —
  // most often because Playwright discarded the worker after an earlier test
  // failed and restarted it, re-importing the spec module and resetting that
  // `let` to its initializer. Without this check the symptom is a 90s hang in
  // fillEmailAndEnableContinue waiting for a Continue button that can never
  // enable for an empty input — do not "simplify" this away.
  if (!email || !email.trim()) {
    throw new Error(
      "signIn called with an empty email — a shared test fixture was not " +
        "initialised. Playwright discards the worker process after a test " +
        "failure, which resets module-level state in spec files.",
    );
  }
  await page.goto("/login");
  await fillEmailAndEnableContinue(page, email);
  const continueBtn = page.getByRole("button", { name: "Continue with email" });
  await continueBtn.click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/);
}

/** Attempt a password sign-in and assert it FAILS (stays on /login with an
 * invalid-credentials error). Used after account deletion to prove the
 * account is gone. */
export async function signInExpectFailure(page: Page, email: string) {
  // See the matching check in `signIn` above — same failure mode, same fix.
  if (!email || !email.trim()) {
    throw new Error(
      "signInExpectFailure called with an empty email — a shared test fixture " +
        "was not initialised. Playwright discards the worker process after a " +
        "test failure, which resets module-level state in spec files.",
    );
  }
  await page.goto("/login");
  await fillEmailAndEnableContinue(page, email);
  const continueBtn = page.getByRole("button", { name: "Continue with email" });
  await continueBtn.click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}

export async function stagingContext(browser: Browser) {
  const ctx = await browser.newContext({
    httpCredentials: {
      username: env("E2E_STAGING_BASIC_USER", "staging"),
      password: env("E2E_STAGING_BASIC_PW"),
    },
    extraHTTPHeaders: {
      "x-staging-auth": env("E2E_STAGING_SECRET"),
    },
  });
  return ctx;
}
