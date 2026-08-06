import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type Page } from "@playwright/test";

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

// Modal budget guardrail. Tests that trigger a Modal round-trip call
// `countAiCall()`; the teardown asserts the total stays within budget so a new
// test can't silently inflate real Modal spend. The counter is module state
// shared across every spec file in the worker — which works because
// playwright.config.ts pins `workers: 1, fullyParallel: false`. If parallel
// workers are ever introduced, this becomes per-worker and the ceiling below
// stops meaning what it says.
//
// Raised 8 → 25 on 2026-08-06, when the whole suite moved to hosted staging:
// local runs used AI_PROVIDER=stub (free), so every one of these is now a real
// paid call. 25 is the measured total, not a guess:
//   converted specs .......... 18  (smoke 4, override 5, maintenance-nudge 5,
//                                   field-visibility 2, no-third-party 2;
//                                   app-shell/signup/recruiter-wizard/
//                                   training-benefits/market-intel = 0)
//   staging-functional ....... 7
//   staging-uat .............. 0   (navigate + screenshot only)
// Keep it a tight ceiling: if a change pushes the real total up, re-measure and
// justify the new number here rather than bumping it to make a run go green.
export const AI_CALL_BUDGET = 25;
let _aiCalls = 0;

export function countAiCall() {
  _aiCalls++;
}

export function assertAiCallBudget(): void {
  if (_aiCalls > AI_CALL_BUDGET) {
    throw new Error(
      `Modal AI call budget exceeded: ${_aiCalls} > ${AI_CALL_BUDGET}. ` +
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

export function createAiCallCounter(limit = 3) {
  let count = 0;
  return {
    inc() {
      count++;
      if (count > limit) throw new Error(`AI call limit (${limit}) exceeded`);
    },
    get count() {
      return count;
    },
  };
}
