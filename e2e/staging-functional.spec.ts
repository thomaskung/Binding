import { test, expect } from "@playwright/test";
import {
  stagingAdminClient,
  ensureStagingUser,
  signIn,
  signInExpectFailure,
  stagingContext,
  countAiCall,
  assertAiCallBudget,
} from "./staging-helpers";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";

/**
 * Staging functional suite — 17 tests, all real. Tests 5→9→17 form one
 * sequential pipeline sharing fresh users via module-level state (workers:1,
 * file order), so each numbered block asserts its slice without repeating the
 * Modal publishes. The pipeline costs exactly 5 Modal calls for the whole run
 * (see countAiCall() call sites); the teardown asserts the suite-wide budget.
 *
 * Fresh users (unique emails per run) keep the nightly idempotent — no shared
 * demo-account state is mutated, so balance assertions are exact.
 */

// Shared pipeline state (assigned by test 5/6, consumed by 7/8/9/16/17).
let pipelineSeekerEmail = "";
let pipelineSeekerId = "";
let pipelineSeekerName = "";
let pipelineRecruiterEmail = "";
let pipelineRecruiterId = "";
let pipelineJobTitle = "";
let pipelineJobId = "";

test.afterAll(() => {
  assertAiCallBudget();
});

test.describe("Staging functional — auth & registration", () => {
  test("1. Login page renders email input and continue button", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
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
    await expect(page.getByTestId("choose-seeker")).toBeVisible();
    await expect(page.getByTestId("choose-recruiter")).toBeVisible();
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
    await page.getByTestId("choose-seeker").click();
    await page.waitForURL(/onboarding\/seeker/);
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
    const user = await ensureStagingUser("seeker");
    pipelineSeekerEmail = user.email;
    pipelineSeekerId = user.id;
    pipelineSeekerName = "Pip Seeker";

    // Onboard via wizard-skip: activation seeds +10 pts, no AI round-trip.
    await signIn(page, pipelineSeekerEmail);
    await completeSeekerOnboarding(page, { name: pipelineSeekerName });

    // Publish triggers redact + embed (2 Modal calls).
    await page.goto("/seeker/profile/resume");
    await page.getByTestId("profile-draft").fill(
      "Senior backend engineer: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform serving 2M users.",
    );
    countAiCall(); // ai.redact
    countAiCall(); // ai.embed
    await page.getByTestId("publish-profile").click();
    await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 30_000 });

    await ctx.close();
  });

  test("6. Recruiter creates and publishes a job", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("recruiter");
    pipelineRecruiterEmail = user.email;
    pipelineRecruiterId = user.id;

    await signIn(page, pipelineRecruiterEmail);
    await completeRecruiterOnboarding(page, {
      name: "Rex Recruiter",
      company: "Nimbus Search Group",
    });

    await page.goto("/recruiter/jobs/new");
    pipelineJobTitle = "Backend Engineer, Payments";
    await page.getByTestId("job-title").fill(pipelineJobTitle);
    await page.getByTestId("job-description").fill(
      "Backend engineer: distributed systems, Postgres, Kubernetes, event-driven pipelines for our payments platform.",
    );
    await page.getByTestId("job-salary-max").fill("150000");
    await page.locator('input[name="work_setups"][value="remote"]').check();
    await page.getByTestId("save-job").click();
    await page.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]+$/);
    pipelineJobId = new URL(page.url()).pathname.split("/").pop() ?? "";

    countAiCall(); // ai.embed on publish
    await page.getByTestId("publish-job").click();
    await expect(page.getByText("Published — matches refreshed.")).toBeVisible({
      timeout: 30_000,
    });

    await ctx.close();
  });

  test("7. Match pipeline shows qualitative band, not raw score", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, pipelineSeekerEmail);

    await page.goto("/seeker/matches");
    const matchCard = page.getByTestId("seeker-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 30_000 });
    // Qualitative band badge — never a raw percentage on the seeker view.
    await expect(matchCard.getByText(/(High|Normal|Low) match/)).toBeVisible();
    await expect(matchCard.getByText(/\d+%/)).toHaveCount(0);

    await ctx.close();
  });
});

test.describe("Staging functional — reveal mechanics", () => {
  test("8. Standard reveal deducts points from recruiter", async ({ browser }) => {
    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    // Seeker expresses interest on the surfaced match.
    await signIn(seeker, pipelineSeekerEmail);
    await seeker.goto("/seeker/matches");
    const matchCard = seeker.getByTestId("seeker-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 30_000 });
    await matchCard.getByTestId("match-interested").click();
    await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Recruiter opens the job matches and reveals.
    await signIn(recruiter, pipelineRecruiterEmail);
    await recruiter.goto(`/recruiter/jobs/${pipelineJobId}`);
    await recruiter.getByTestId("view-matches").click();
    countAiCall(); // ai.fitSummary on reveal
    await recruiter.getByTestId("reveal-candidate").click();
    await expect(recruiter.getByTestId("revealed-name")).toHaveText(pipelineSeekerName, {
      timeout: 30_000,
    });
    await expect(recruiter.getByTestId("fit-summary")).toBeVisible();

    // Recruiter spent 10 of 100 seed points.
    await recruiter.goto("/recruiter/jobs");
    await expect(recruiter.getByTestId("points-balance")).toHaveText("90 points");

    await seekerCtx.close();
    await recruiterCtx.close();
  });

  test("9. Reveal compensates seeker regardless of outcome", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, pipelineSeekerEmail);

    // Seeker earned +3 reveal compensation on top of the 10-pt seed, regardless
    // of any downstream outcome (the reveal already happened in test 8).
    await page.goto("/seeker/points");
    await expect(page.getByTestId("points-page-balance")).toHaveText("13 points");

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
      if (!url.hostname.includes("binding-staging.vercel.app") &&
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
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    await page.waitForURL(/\/onboarding/);
    await page.getByTestId("choose-seeker").click();
    await page.waitForURL(/onboarding\/seeker/);
    await page.getByTestId("onboard-name").fill("Priya Privacy");
    await page.getByTestId("onboard-tos").check();
    await page.getByTestId("onboard-consent").check();
    await page.getByTestId("onboard-profiling").check();
    await page.getByTestId("onboard-continue").click();
    await page.waitForURL(/onboarding\/seeker\/profile/);

    // Paste path (Layer 0): stripPiiPatterns runs in-browser BEFORE extraction.
    const raw = "reach me at priya.p@example.com or +65 8123 4567 — senior backend engineer";
    await page.getByTestId("onboarding-resume-paste").fill(raw);
    countAiCall(); // ai.extractProfileFields runs on extracted fields
    await page.getByTestId("onboarding-extract").click();
    await expect(page.getByTestId("pii-preview-note")).toBeVisible({ timeout: 15_000 });
    // The note enumerates the detected categories ("email addresses", "phone
    // numbers") — the Layer-0 proof identifiers were stripped before leaving
    // the device.
    await expect(page.getByTestId("pii-preview-note")).toContainText(/email|phone/);
    // The AI-extracted items derive from the STRIPPED text — the raw email must
    // never leak through into any extracted field.
    const extractedText = await page.locator("body").innerText();
    expect(extractedText).not.toContain("priya.p@example.com");
    expect(extractedText).not.toContain("+65 8123 4567");
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
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);

    // Activate the seeker role first (wizard-skip, no AI).
    await completeSeekerOnboarding(page, { name: "Switchy Seeker" });
    await page.waitForURL(/\/seeker$/);

    // Switch to the missing recruiter role — routes to /onboarding/recruiter.
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Recruiter" }).click();
    await page.waitForURL(/onboarding\/recruiter/);
    await completeRecruiterOnboarding(page, { name: "Switchy Recruiter", company: "Dual Mode Ltd" });

    // Dual-role now: the switcher toggles between real dashboards.
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Seeker" }).click();
    await page.waitForURL(/\/seeker$/);
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Recruiter" }).click();
    await page.waitForURL(/\/recruiter$/);
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Seeker" }).click();
    await page.waitForURL(/\/seeker$/);

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
    await signInExpectFailure(page, user.email);
    await ctx.close();
  });
});

test.describe("Staging functional — maintenance & messaging", () => {
  test("16. Staleness nudge surfaces on stale profile", async ({ browser }) => {
    // Reuse the already-published pipeline seeker (no extra AI round-trip).
    const admin = stagingAdminClient();
    await admin
      .from("profiles")
      .update({ last_profile_activity_at: new Date(Date.now() - 100 * 86_400_000).toISOString() })
      .eq("id", pipelineSeekerId);

    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, pipelineSeekerEmail);
    await page.goto("/seeker");
    await expect(page.getByTestId("stale-nudge-card")).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });

  test("17. In-app messaging works post-reveal", async ({ browser }) => {
    const recruiterCtx = await stagingContext(browser);
    const seekerCtx = await stagingContext(browser);
    const recruiter = await recruiterCtx.newPage();
    const seeker = await seekerCtx.newPage();

    // Recruiter opens the thread created by the test-8 reveal and messages.
    await signIn(recruiter, pipelineRecruiterEmail);
    await recruiter.goto(`/recruiter/jobs/${pipelineJobId}`);
    await recruiter.getByTestId("view-matches").click();
    await recruiter.getByTestId("open-thread").click();
    await recruiter.getByTestId("message-input").fill("Hi! Keen to chat about the payments role.");
    await recruiter.getByTestId("message-send").click();
    await expect(recruiter.getByTestId("message-bubble")).toHaveCount(1);

    // Seeker replies from their side of the same thread.
    await signIn(seeker, pipelineSeekerEmail);
    await seeker.goto("/seeker/matches");
    await seeker.getByRole("button", { name: "Message recruiter" }).click();
    await expect(seeker.getByTestId("message-bubble")).toHaveCount(1);
    await seeker.getByTestId("message-input").fill("Sounds interesting — tell me more.");
    await seeker.getByTestId("message-send").click();
    await expect(seeker.getByTestId("message-bubble")).toHaveCount(2);

    await recruiterCtx.close();
    await seekerCtx.close();
  });
});
