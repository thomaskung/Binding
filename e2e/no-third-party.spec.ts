import { expect, test } from "@playwright/test";

/**
 * Layer-0 no-tracker posture (DESIGN.md §2f): resume-handling pages must
 * load zero third-party resources — no analytics, no CDN scripts, no
 * cross-origin anything. This is the enforceable slice of the CSP posture
 * (full nonce-CSP via middleware is deferred hardening, pre-public-launch).
 *
 * Uses the seeded demo seeker (supabase/seed.sql) — run `pnpm db:reset`
 * first, like the rest of the suite.
 */

const SEEKER = { email: "seeker@demo.local", password: "J0B!Demo#2026$secure" };

test("resume-handling pages make no third-party requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost:3000").host;
  const thirdParty: string[] = [];
  page.on("request", (req) => {
    const host = new URL(req.url()).host;
    if (host !== origin) thirdParty.push(req.url());
  });

  await page.goto("/login");
  await page.getByLabel("Work email").fill(SEEKER.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(SEEKER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/);

  await page.goto("/seeker/profile/resume");
  await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 15_000 });
  await page.goto("/seeker/profile");
  await page.waitForLoadState("networkidle");

  // Local Supabase (ports on localhost/127.0.0.1) is first-party
  // infrastructure — everything else is a violation.
  const violations = thirdParty.filter(
    (url) => !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url),
  );
  expect(violations).toEqual([]);
});
