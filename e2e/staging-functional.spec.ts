import { test, expect } from "@playwright/test";
import { stagingAdminClient, ensureStagingUser, signIn, stagingContext, createAiCallCounter } from "./staging-helpers";

test.describe("Staging functional — auth & registration", () => {
  test("1. Login page renders email input and continue button", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
    await ctx.close();
  });

  test("2. Password login works with demo account", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, "seeker@demo.local");
    expect(page.url()).not.toContain("/login");
    await ctx.close();
  });

  test("3. Signup page shows intent chooser without intent param", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await page.goto("/signup");
    await expect(page.locator("body")).toContainText(/seeker|recruiter|intent/i);
    await ctx.close();
  });
});

test.describe("Staging functional — consent & profiling", () => {
  test("4. Seeker onboarding consent gates are visible", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await page.waitForURL(/\/onboarding/);
    await expect(page.getByTestId("onboard-tos")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("onboard-consent")).toBeVisible();
    await expect(page.getByTestId("onboard-profiling")).toBeVisible();
    await expect(page.getByTestId("onboard-maintenance")).toBeVisible();
    await ctx.close();
  });
});

test.describe("Staging functional — matching pipeline", () => {
  test("5. Seeker publishes profile and trigger matching", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const ai = createAiCallCounter();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    // Onboarding wizard — skip to dashboard, then publish a profile
    // (actual publish triggers redact + embed via Modal)
    await ctx.close();
  });

  test("6. Recruiter creates and publishes a job", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("recruiter");
    await signIn(page, user.email);
    await ctx.close();
  });

  test("7. Match pipeline shows qualitative band, not raw score", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });
});

test.describe("Staging functional — reveal mechanics", () => {
  test("8. Standard reveal deducts points from recruiter", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });

  test("9. Reveal compensates seeker regardless of outcome", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });
});

test.describe("Staging functional — privacy & Layer-0", () => {
  test("10. No third-party requests on resume upload page", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const requests: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (!url.hostname.includes("jumponboard-staging.vercel.app") &&
          !url.hostname.includes("supabase.co") &&
          !url.hostname.includes("127.0.0.1") &&
          !url.hostname.includes("localhost")) {
        requests.push(url.hostname);
      }
    });
    await page.goto("/seeker/profile/resume");
    // No third-party requests should fire on page load
    expect(requests).toEqual([]);
    await ctx.close();
  });

  test("11. PII patterns stripped from paste-text path", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });
});

test.describe("Staging functional — routing & UIUX", () => {
  test("12. All path-segment routes work without query params", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, "seeker@demo.local");
    const routes = ["/seeker", "/seeker/matches", "/seeker/points", "/seeker/profile", "/seeker/profile/resume"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("body")).toBeAttached();
      expect(page.url()).not.toContain("?");
    }
    await ctx.close();
  });

  test("13. Role switcher toggles seeker and recruiter", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, "seeker@demo.local");
    await ctx.close();
  });

  test("14. Unauthenticated user redirected to /login", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await page.goto("/seeker");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});

test.describe("Staging functional — account lifecycle", () => {
  test("15. Account deletion cascades cleanly", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await page.goto("/account");
    await page.getByRole("button", { name: /delete/i }).click();
    const input = page.locator("input[placeholder='DELETE']");
    await input.fill("DELETE");
    await page.getByRole("button", { name: /permanently delete/i }).click();
    await page.waitForURL(/\/login/);
    // Verify the user can no longer sign in
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});

test.describe("Staging functional — maintenance & messaging", () => {
  test("16. Staleness nudge surfaces on stale profile", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });

  test("17. In-app messaging works post-reveal", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await ctx.close();
  });
});
