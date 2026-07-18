import { expect, test, type Page } from "@playwright/test";

/**
 * Landing sign-up/sign-in split acceptance tests. Stops before real
 * magic-link delivery — real sign-ins in e2e use the (env-gated) password
 * tab, same as the other specs.
 */

const SEEKER = { email: "seeker@demo.local", password: "J0B!Demo#2026$secure" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(user.email);
  await page.getByRole("textbox", { name: "Password" }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/);
}

test("landing splits sign-up CTAs from the sign-in nav link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cta-seeker")).toHaveText("Sign up to find a job");
  await expect(page.getByTestId("cta-recruiter")).toHaveText("Sign up to hire talent");

  // Nav sign-in link → /login
  await page.getByTestId("nav-signin").click();
  await page.waitForURL(/\/login$/);
  await expect(page.getByText("Sign in to JumpOnBoard")).toBeVisible();

  // Login's nav cross-link goes back to signup
  await page.getByTestId("nav-signup").click();
  await page.waitForURL(/\/signup$/);
});

test("signup with intent shows the email form directly; without intent shows the chooser", async ({
  page,
}) => {
  // Landing CTA carries intent → email form immediately, no chooser.
  await page.goto("/");
  await page.getByTestId("cta-seeker").click();
  await page.waitForURL(/\/signup\?intent=seeker/);
  await expect(page.getByTestId("signup-email")).toBeVisible();
  await expect(page.getByTestId("choose-seeker")).toHaveCount(0);

  // Bare /signup → chooser first; picking updates the URL and reveals the form.
  await page.goto("/signup");
  await expect(page.getByTestId("choose-recruiter")).toBeVisible();
  await expect(page.getByTestId("signup-email")).toHaveCount(0);
  await page.getByTestId("choose-recruiter").click();
  await page.waitForURL(/\/signup\?intent=recruiter/);
  await expect(page.getByTestId("signup-email")).toBeVisible();

  // Garbage intent behaves like no intent (chooser, not a guessed role).
  await page.goto("/signup?intent=admin");
  await expect(page.getByTestId("choose-seeker")).toBeVisible();

  // Submit is disabled until an email is entered.
  await page.goto("/signup?intent=seeker");
  await expect(page.getByTestId("signup-submit")).toBeDisabled();
  await page.getByTestId("signup-email").fill("newuser@example.com");
  await expect(page.getByTestId("signup-submit")).toBeEnabled();
});

test("login shows both tabs when password login is enabled (e2e env)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("tab", { name: "Magic link" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Password" })).toBeVisible();
});

test("signed-in users are routed away from /signup and /login; intent for a missing role wins", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, SEEKER);

  // Bare auth pages bounce a signed-in seeker to their dashboard.
  await page.goto("/signup");
  await page.waitForURL(/\/seeker$/);
  await page.goto("/login");
  await page.waitForURL(/\/seeker$/);

  // Intent for a role they DON'T hold reaches that role's activation —
  // not the dashboard (the intent-wins fix).
  await page.goto("/signup?intent=recruiter");
  await page.waitForURL(/\/onboarding\/recruiter/);
  await expect(page.getByTestId("recruiter-company")).toBeVisible();

  await ctx.close();
});
