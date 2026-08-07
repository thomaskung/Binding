import { expect, test } from "@playwright/test";
import { ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";
import { completeSeekerOnboarding } from "./seeker-onboarding";

/**
 * Landing sign-up/sign-in split acceptance tests, run against hosted
 * staging. Stops before real magic-link delivery — real sign-ins in e2e use
 * the (env-gated) password tab, same as the other specs.
 *
 * Every test opens its page through `stagingContext(browser)` so requests
 * carry the staging basic-auth + shared-secret headers the middleware gate
 * requires. Users are created fresh per run via `ensureStagingUser` — no
 * seeded demo account is relied on. Modal AI cost: ZERO — the one test that
 * needs a signed-in seeker with an activated role uses the free
 * `wizard-skip` path in `completeSeekerOnboarding` (no resume text, no AI
 * round-trip).
 */

test("landing splits sign-up CTAs from the sign-in nav link", async ({ browser }) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  await page.goto("/", { timeout: 30_000 });
  // Copy was "Sign up to find a job" / "Sign up to hire talent" pre-restyle
  // (feat/binding-ui-restyle); now updating to "Find a job privately" per the
  // Binding UI mockup restyle. Testids and seeker/recruiter split are what
  // this test actually guards, so assert current copy rather than a stale literal.
  await expect(page.getByTestId("cta-seeker")).toHaveText("Find a job privately", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("cta-recruiter")).toHaveText("Hire verified talent");

  // Nav sign-in link → /login
  await page.getByTestId("nav-signin").click();
  await page.waitForURL(/\/login$/, { timeout: 15_000 });
  await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 15_000 });

  // Login's nav cross-link goes back to signup
  await page.getByTestId("nav-signup").click();
  await page.waitForURL(/\/signup$/, { timeout: 15_000 });
  await ctx.close();
});

test("privacy notice is readable signed-out (middleware must not gate it)", async ({ browser }) => {
  // Regression guard: /privacy shipped without a middleware allowlist entry,
  // so signed-out staging visitors got the login page instead — a privacy
  // notice behind a login defeats its purpose (must be readable pre-signup).
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  await page.goto("/privacy", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Subprocessors and data location")).toBeVisible();
  await ctx.close();
});

test("signup with intent shows the email form directly; without intent shows the chooser", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  // Landing CTA carries intent → email form immediately, no chooser.
  await page.goto("/", { timeout: 30_000 });
  await page.getByTestId("cta-seeker").click();
  await page.waitForURL(/\/signup\?intent=seeker/, { timeout: 15_000 });
  await expect(page.getByTestId("signup-email")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("choose-seeker")).toHaveCount(0);

  // Bare /signup → chooser first; picking updates the URL and reveals the form.
  await page.goto("/signup", { timeout: 30_000 });
  await expect(page.getByTestId("choose-recruiter")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("signup-email")).toHaveCount(0);
  await page.getByTestId("choose-recruiter").click();
  await page.waitForURL(/\/signup\?intent=recruiter/, { timeout: 15_000 });
  await expect(page.getByTestId("signup-email")).toBeVisible();

  // Garbage intent behaves like no intent (chooser, not a guessed role).
  await page.goto("/signup?intent=admin", { timeout: 30_000 });
  await expect(page.getByTestId("choose-seeker")).toBeVisible({ timeout: 15_000 });

  // Submit is disabled until an email is entered.
  await page.goto("/signup?intent=seeker", { timeout: 30_000 });
  await expect(page.getByTestId("signup-submit")).toBeDisabled({ timeout: 15_000 });
  await page.getByTestId("signup-email").fill("newuser@example.com");
  await expect(page.getByTestId("signup-submit")).toBeEnabled();
  await ctx.close();
});

test("login offers both password and magic-link after entering email (e2e env)", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  await page.goto("/login", { timeout: 30_000 });
  await page.getByLabel("Work email").fill("someone@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Email me a magic link" })).toBeVisible();
  await ctx.close();
});

test("signed-in users are routed away from /signup and /login; intent for a missing role wins", async ({
  browser,
}) => {
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();

  // Fresh seeker-only account (wizard-skip: 0 AI calls) — needs an activated
  // seeker role but deliberately no recruiter role, to exercise the
  // intent-for-a-missing-role branch below.
  const user = await ensureStagingUser("seeker");
  await signIn(page, user.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Signup Redirect Seeker") });

  // Bare auth pages bounce a signed-in seeker to their dashboard.
  await page.goto("/signup", { timeout: 30_000 });
  await page.waitForURL(/\/seeker$/, { timeout: 20_000 });
  await page.goto("/login", { timeout: 30_000 });
  await page.waitForURL(/\/seeker$/, { timeout: 20_000 });

  // Intent for a role they DON'T hold reaches that role's activation —
  // not the dashboard (the intent-wins fix).
  await page.goto("/signup?intent=recruiter", { timeout: 30_000 });
  await page.waitForURL(/\/onboarding\/recruiter/, { timeout: 20_000 });
  await expect(page.getByTestId("recruiter-company")).toBeVisible({ timeout: 15_000 });

  await ctx.close();
});
