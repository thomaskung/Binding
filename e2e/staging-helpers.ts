import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type Page } from "@playwright/test";

const TEST_RUN_ID = Date.now().toString(36);
const PASSWORD = "J0B!Demo#2026$secure";

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
  await page.getByRole("button", { name: "Continue with email" }).click();
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
  await page.getByRole("button", { name: "Continue with email" }).click();
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
