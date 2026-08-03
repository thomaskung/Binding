import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type Page } from "@playwright/test";

const TEST_RUN_ID = Date.now().toString(36);
const PASSWORD = "J0B!Demo#2026$secure";

// Modal budget guardrail: the staging functional suite is deliberately lean on
// AI calls (5 publish/reveal/extract calls for the whole run — see the
// per-test cost table in staging-functional.spec.ts). Tests that trigger an AI
// round-trip call `countAiCall()`, and the suite teardown asserts the total
// stays under the budget so a future test can't silently inflate Modal spend.
export const AI_CALL_BUDGET = 6;
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

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  const continueBtn = page.getByRole("button", { name: "Continue with email" });
  // React hydration can reset a controlled input right after fill (value snaps
  // back to "" and the submit button stays disabled). Re-apply the email if the
  // button hasn't enabled — cold staging instances hydrate slower than the
  // first sign-in on a warm function.
  try {
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  } catch {
    await page.getByLabel("Work email").fill(email);
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  }
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
  await page.getByLabel("Work email").fill(email);
  const continueBtn = page.getByRole("button", { name: "Continue with email" });
  try {
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  } catch {
    await page.getByLabel("Work email").fill(email);
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  }
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
