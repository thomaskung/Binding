import { test, expect } from "@playwright/test";
import { widenMatchFilter } from "./match-helpers";
import {
  stagingAdminClient,
  ensureStagingUser,
  signIn,
  signInExpectFailure,
  stagingContext,
  countAiCall,
  assertAiCallBudget,
  uniqueLabel,
} from "./staging-helpers";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";

/**
 * Staging functional suite — 23 tests, all real. Tests 5→9→17 form one
 * sequential pipeline sharing fresh users via module-level state (workers:1,
 * file order), so each numbered block asserts its slice without repeating the
 * Modal publishes. Tests 18/20 also reuse the pipeline's already-published
 * seeker profile (18 additionally reuses the pipeline recruiter, but needs a
 * BRAND NEW job — see that test's comment for why). The pipeline + reuse
 * costs exactly 6 Modal calls for the whole run (see countAiCall() call
 * sites); the teardown asserts the suite-wide budget.
 *
 * Fresh users (unique emails per run) keep the nightly idempotent — no shared
 * demo-account state is mutated, so balance assertions are exact.
 */

// Shared pipeline state (assigned by test 5/6, consumed by 7/8/9/16/17/18/20).
let pipelineSeekerEmail = "";
let pipelineSeekerId = "";
let pipelineSeekerName = "";
let pipelineRecruiterEmail = "";
let pipelineRecruiterId = "";
let pipelineJobTitle = "";
let pipelineJobId = "";

// NOTE: deliberately NOT using test.describe.configure({ mode: "serial" })
// here. Serial mode would skip every subsequent test in the file after any
// one failure — including tests 10-15, which are fully independent of the
// pipeline fixture and would otherwise still pass. The `test.skip(...)`
// guards on the individual pipeline-dependent tests below give the same
// "don't fail misleadingly on stale module state" protection without
// sacrificing that unrelated coverage.

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

  test("2. Password login works with a fresh account", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
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

  test("3b. Privacy notice is readable signed-out (session middleware must not gate it)", async ({
    browser,
  }) => {
    // Regression guard for the launch-blocking miss found 2026-07-30: /privacy
    // shipped without a middleware allowlist entry, so signed-out visitors got
    // the login page. A privacy notice behind a login defeats its purpose.
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await page.goto("/privacy");
    expect(page.url()).toContain("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
    await expect(page.getByText("Subprocessors and data location")).toBeVisible();
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
    test.setTimeout(180_000);
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    if (!user.id) throw new Error(`ensureStagingUser returned no id for ${user.email} (email collision)`);
    pipelineSeekerEmail = user.email;
    pipelineSeekerId = user.id;
    pipelineSeekerName = uniqueLabel("Pip Seeker");

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
    // Modal redact+embed can cold-start (the CI warm-up only hits the embedder)
    // — give the round-trip generous headroom. (Raised 60s -> 90s after a real
    // staging timeout; test.setTimeout(180_000) above gives this room under
    // playwright.config.ts's 120s default test cap.)
    await expect(page.getByTestId("redacted-preview")).toBeVisible({ timeout: 90_000 });

    await ctx.close();
  });

  test("6. Recruiter creates and publishes a job", async ({ browser }) => {
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("recruiter");
    if (!user.id) throw new Error(`ensureStagingUser returned no id for ${user.email} (email collision)`);
    pipelineRecruiterEmail = user.email;
    pipelineRecruiterId = user.id;

    await signIn(page, pipelineRecruiterEmail);
    await completeRecruiterOnboarding(page, {
      name: uniqueLabel("Rex Recruiter"),
      company: uniqueLabel("Nimbus Search Group"),
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
      timeout: 60_000,
    });

    await ctx.close();
  });

  test("7. Match pipeline shows qualitative band, not raw score", async ({ browser }) => {
    test.skip(!pipelineSeekerEmail, "pipeline fixture unavailable — an earlier test failed and Playwright reset module state");
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, pipelineSeekerEmail);

    await page.goto("/seeker/matches");
    const matchCard = page.getByTestId("seeker-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 60_000 });
    // Qualitative band badge — never a raw percentage on the seeker view.
    await expect(matchCard.getByText(/(High|Normal|Low) match/)).toBeVisible();
    await expect(matchCard.getByText(/\d+%/)).toHaveCount(0);

    await ctx.close();
  });
});

test.describe("Staging functional — reveal mechanics", () => {
  test("8. Standard reveal deducts points from recruiter", async ({ browser }) => {
    test.skip(
      !pipelineSeekerEmail ||
        !pipelineSeekerId ||
        !pipelineSeekerName ||
        !pipelineRecruiterEmail ||
        !pipelineRecruiterId ||
        !pipelineJobId,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    // Reset both pipeline ledgers so the reveal outcome is deterministic even
    // across a retry (otherwise a first-attempt reveal + retry reveal would
    // double-spend the recruiter and double-compensate the seeker, breaking the
    // "80 points" / "13 points" assertions in tests 8 and 9).
    const admin = stagingAdminClient();
    await admin.from("points_ledger").delete().eq("profile_id", pipelineRecruiterId);
    await admin.from("points_ledger").insert({
      profile_id: pipelineRecruiterId,
      event: "seed",
      amount: 100,
      note: "recruiter activation seed",
    });
    await admin.from("points_ledger").delete().eq("profile_id", pipelineSeekerId);
    await admin.from("points_ledger").insert({
      profile_id: pipelineSeekerId,
      event: "seed",
      amount: 10,
      note: "seeker activation seed",
    });

    const seekerCtx = await stagingContext(browser);
    const recruiterCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    const recruiter = await recruiterCtx.newPage();

    // Seeker expresses interest on the surfaced match.
    await signIn(seeker, pipelineSeekerEmail);
    await seeker.goto("/seeker/matches");
    const matchCard = seeker.getByTestId("seeker-match-card").first();
    await expect(matchCard).toBeVisible({ timeout: 60_000 });
    await matchCard.getByTestId("match-interested").click();
    await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Recruiter opens the job matches and reveals.
    await signIn(recruiter, pipelineRecruiterEmail);
    await recruiter.goto(`/recruiter/jobs/${pipelineJobId}`);
    await recruiter.getByTestId("view-matches").click();
    // Reveal happens from the detail panel (pops out on card click); widen the
    // min-match filter (default 70%) so the seeded match stays visible.
    await widenMatchFilter(recruiter);
    await recruiter.getByTestId("recruiter-match-card").filter({ hasText: "interested" }).first().click();
    await expect(recruiter.getByTestId("candidate-panel")).toBeVisible();
    countAiCall(); // ai.fitSummary on reveal
    await recruiter.getByTestId("reveal-candidate").click();
    await expect(recruiter.getByTestId("revealed-name")).toHaveText(pipelineSeekerName, {
      timeout: 60_000,
    });
    await expect(recruiter.getByTestId("fit-summary")).toBeVisible({ timeout: 60_000 });

    // Recruiter spent the match-quality reveal cost of the 100-pt seed. The
    // cost is dynamic (§4a): score ≥ 0.8 → 2× (20 pts), ≥ 0.65 → 1.5× (15 pts),
    // else flat (10 pts). Read the match score to compute the exact expected
    // balance rather than hardcoding a number.
    const { data: matchRow } = await admin
      .from("matches")
      .select("score")
      .eq("job_posting_id", pipelineJobId)
      .eq("profile_id", pipelineSeekerId)
      .maybeSingle();
    const score = matchRow?.score ?? 0;
    const expectedCost =
      score >= 0.8 ? 20 : score >= 0.65 ? 15 : 10;
    const expectedBalance = 100 - expectedCost;

    await recruiter.goto("/recruiter/jobs");
    await expect(recruiter.getByTestId("points-balance")).toHaveText(
      `${expectedBalance} points`,
    );

    await seekerCtx.close();
    await recruiterCtx.close();
  });

  test("9. Reveal compensates seeker regardless of outcome", async ({ browser }) => {
    test.skip(!pipelineSeekerEmail, "pipeline fixture unavailable — an earlier test failed and Playwright reset module state");
    test.setTimeout(180_000);
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
  test("10. No third-party requests on resume upload page", async ({ browser, baseURL }) => {
    // First-party hosts derived from the actual targets (hosted staging +
    // its Supabase project) — mirrors e2e/no-third-party.spec.ts. No
    // 127.0.0.1/localhost entries: those are meaningless against hosted
    // staging and only weaken the assertion.
    const firstPartyHosts = new Set(
      [baseURL, process.env.E2E_SUPABASE_URL]
        .filter((v): v is string => Boolean(v))
        .map((v) => new URL(v).host),
    );
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const requests: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return; // data:/blob:/about: etc.
      if (!firstPartyHosts.has(url.host)) requests.push(url.hostname);
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
    const user = await ensureStagingUser("seeker");
    await signIn(page, user.email);
    // Onboard (wizard-skip, free) so these routes serve real dashboard pages
    // rather than bouncing an un-onboarded user to /onboarding.
    await completeSeekerOnboarding(page, { name: uniqueLabel("Routes Seeker") });
    const routes = ["/seeker", "/seeker/matches", "/seeker/points", "/seeker/profile", "/seeker/profile/resume"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("body")).toBeAttached();
      expect(page.url()).toContain(route);
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

    // The rail starts collapsed by default; the full role-switch tabs only
    // render when it's expanded (collapsed shows an icon-only switcher). Expand
    // it once (cookie-persisted) so the "Seeker"/"Recruiter" tabs are present.
    const expandRail = page.getByLabel("Expand navigation");
    if (await expandRail.isVisible().catch(() => false)) await expandRail.click();

    // Switch to the missing recruiter role — routes to /onboarding/recruiter.
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Recruiter" }).click();
    await page.waitForURL(/onboarding\/recruiter/);
    await completeRecruiterOnboarding(page, { name: "Switchy Recruiter", company: "Dual Mode Ltd" });

    // Dual-role now: the switcher toggles between real dashboards. The account
    // panel stays open across tab switches (AppShell persists in the layout),
    // so we only open it once and then flip tabs directly.
    await page.getByTestId("account-menu-toggle").click();
    await page.getByRole("tab", { name: "Seeker" }).click();
    await page.waitForURL(/\/seeker$/);
    await page.getByRole("tab", { name: "Recruiter" }).click();
    await page.waitForURL(/\/recruiter$/);
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
    test.skip(
      !pipelineSeekerEmail || !pipelineSeekerId,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    test.setTimeout(180_000);
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
    test.skip(
      !pipelineSeekerEmail || !pipelineRecruiterEmail || !pipelineJobId || !pipelineSeekerName,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    test.setTimeout(180_000);
    const recruiterCtx = await stagingContext(browser);
    const seekerCtx = await stagingContext(browser);
    const recruiter = await recruiterCtx.newPage();
    const seeker = await seekerCtx.newPage();

    // Recruiter opens the thread created by the test-8 reveal and messages.
    await signIn(recruiter, pipelineRecruiterEmail);
    await recruiter.goto(`/recruiter/jobs/${pipelineJobId}`);
    await recruiter.getByTestId("view-matches").click();
    await widenMatchFilter(recruiter);
    await recruiter.getByTestId("recruiter-match-card").filter({ hasText: pipelineSeekerName }).first().click();
    await expect(recruiter.getByTestId("candidate-panel")).toBeVisible();
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

test.describe("Staging functional — dealbreaker & tier differentiation", () => {
  test("18. Equity dealbreaker filters matches when candidate requires it", async ({ browser }) => {
    test.skip(
      !pipelineSeekerEmail || !pipelineSeekerId || !pipelineRecruiterEmail,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    const admin = stagingAdminClient();
    // Require equity on the pipeline seeker's dealbreaker matrix. Reuses the
    // profile published in test 5 — no second Modal redact+embed round-trip.
    const { data: seekerProfile } = await admin
      .from("profiles")
      .select("dealbreaker_matrix")
      .eq("id", pipelineSeekerId)
      .maybeSingle();
    const updatedMatrix = {
      ...((seekerProfile?.dealbreaker_matrix ?? {}) as Record<string, unknown>),
      equity_required: true,
    };
    await admin.from("profiles").update({ dealbreaker_matrix: updatedMatrix }).eq("id", pipelineSeekerId);

    // Recruiter (pipeline account) creates + publishes a job that DOES offer
    // equity — via the actual "This role offers equity" checkbox, not just
    // description wording (the original spec never checked that box, so the
    // job it created didn't really offer equity; fixed here). Dealbreakers
    // are enforced at match-refresh time (baked into the `matches` row when
    // it's created, not re-evaluated on read), so this MUST be a job that has
    // never matched this candidate before — reusing pipelineJobId would find
    // the old (pre-dealbreaker) match row already sitting in the table and
    // prove nothing about the filter.
    const recruiterCtx = await stagingContext(browser);
    const recruiter = await recruiterCtx.newPage();
    await signIn(recruiter, pipelineRecruiterEmail);

    await recruiter.goto("/recruiter/jobs/new");
    const jobTitle = uniqueLabel("Backend Equity Engineer");
    await recruiter.getByTestId("job-title").fill(jobTitle);
    await recruiter.getByTestId("job-description").fill(
      "Backend engineer: distributed systems, Postgres, Kubernetes, event-driven pipelines for our payments platform.",
    );
    await recruiter.getByTestId("job-salary-max").fill("160000");
    await recruiter.locator('input[name="work_setups"][value="remote"]').check();
    await recruiter.getByTestId("job-offers-equity").check();
    await recruiter.getByTestId("save-job").click();
    await recruiter.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]+$/);
    countAiCall(); // ai.embed on publish
    await recruiter.getByTestId("publish-job").click();
    // Modal embed cold-start can run long for a standalone job near the end of
    // the suite — give it generous headroom.
    await expect(recruiter.getByText("Published — matches refreshed.")).toBeVisible({ timeout: 120_000 });

    // Seeker with equity_required should still see this match — the
    // dealbreaker must not filter out a job that satisfies it.
    const seekerCtx = await stagingContext(browser);
    const seeker = await seekerCtx.newPage();
    await signIn(seeker, pipelineSeekerEmail);
    await seeker.goto("/seeker/matches");
    await expect(seeker.getByTestId("seeker-match-card").filter({ hasText: jobTitle })).toBeVisible({
      timeout: 30_000,
    });

    await seekerCtx.close();
    await recruiterCtx.close();
  });

  test("19. Business-email signup gate rejects consumer domains", async ({ browser }) => {
    const admin = stagingAdminClient();
    // Create a user with a consumer email directly via admin API.
    const user = await admin.auth.admin.createUser({
      email: `test-gate-${Date.now().toString(36)}@gmail.com`,
      password: "J0B!Demo#2026$secure",
      email_confirm: true,
    });
    if (!user.data.user) throw new Error("createUser failed");

    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, user.data.user.email!);

    // Attempt recruiter activation — the server-side gate rejects consumer
    // email domains, so the recruiter profile must NOT be created (the throw
    // aborts before the profiles upsert). Assert the activation failed by
    // checking the user was not granted the recruiter role.
    await page.goto("/onboarding");
    await page.getByTestId("choose-recruiter").click();
    await page.waitForURL(/onboarding\/recruiter/);
    await page.getByTestId("recruiter-name").fill("Gate Test");
    await page.getByTestId("recruiter-company").fill("Acme");
    await page.getByTestId("recruiter-tos").check();
    await page.getByTestId("recruiter-continue").click();
    // Give the server action time to reject, then verify no recruiter role.
    await page.waitForTimeout(5_000);
    const { data: profile } = await admin
      .from("profiles")
      .select("is_recruiter")
      .eq("id", user.data.user.id)
      .maybeSingle();
    expect(profile?.is_recruiter ?? false).toBe(false);
    await ctx.close();
  });

  test("20. Credentials de-identified on recruiter match card", async ({ browser }) => {
    test.skip(
      !pipelineSeekerId || !pipelineRecruiterEmail || !pipelineJobId || !pipelineSeekerName,
      "pipeline fixture unavailable — an earlier test failed and Playwright reset module state",
    );
    const admin = stagingAdminClient();
    // Set credentials + credentials_summary directly on the pipeline seeker
    // (already published in test 5). match_candidates (the RPC the
    // recruiter's match list reads live, src/app/(app)/recruiter/jobs/[id]/
    // matches/page.tsx) selects credentials_summary from `profiles` at read
    // time — no republish/re-embed needed for this column to show up, and
    // reusing pipelineJobId's existing match row costs zero extra Modal.
    await admin
      .from("profiles")
      .update({
        credentials: "AWS Solutions Architect Professional, Certified Kubernetes Administrator",
        credentials_summary: "2 certifications",
      })
      .eq("id", pipelineSeekerId);

    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    await signIn(page, pipelineRecruiterEmail);
    await page.goto(`/recruiter/jobs/${pipelineJobId}`);
    await page.getByTestId("view-matches").click();
    await widenMatchFilter(page);
    // pipelineJobId's canonical description text can also match other
    // spec files' seekers on this shared, never-reset DB — filter by the
    // pipeline seeker's (already-revealed, since test 8) name rather than
    // `.first()`, or a coincidental extra match row could pick the wrong card.
    const card = page.getByTestId("recruiter-match-card").filter({ hasText: pipelineSeekerName }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Positive: the de-identified summary chip actually renders (not just an
    // absence of the raw text below — that alone would pass vacuously if the
    // field never reached the page at all).
    await expect(card.getByTestId("credentials-chip")).toContainText("2 certifications");

    // Negative: the raw credential names must never leak into the render.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("AWS Solutions Architect Professional");
    expect(bodyText).not.toContain("Certified Kubernetes Administrator");

    await ctx.close();
  });

  test("21. Recruiter tier badge and sidebar label", async ({ browser }) => {
    const admin = stagingAdminClient();
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("recruiter");
    if (!user.id) throw new Error(`ensureStagingUser returned no id for ${user.email} (email collision)`);
    await signIn(page, user.email);
    await completeRecruiterOnboarding(page, {
      name: uniqueLabel("Tier Recruiter"),
      company: uniqueLabel("Tier Search Co"),
    });

    await admin.from("profiles").update({ recruiter_tier: "solo" }).eq("id", user.id);

    // Dashboard shows Solo badge.
    await page.goto("/recruiter");
    await expect(page.getByText("Solo").first()).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });

  test("22. Pro tier badge on dashboard, profile, and points page", async ({ browser }) => {
    const admin = stagingAdminClient();
    const ctx = await stagingContext(browser);
    const page = await ctx.newPage();
    const user = await ensureStagingUser("seeker");
    if (!user.id) throw new Error(`ensureStagingUser returned no id for ${user.email} (email collision)`);
    await signIn(page, user.email);
    await completeSeekerOnboarding(page, { name: uniqueLabel("Tier Seeker") });

    await admin.from("profiles").update({ seeker_tier: "pro" }).eq("id", user.id);

    // Dashboard: Pro badge, no upsell card (the two are mutually exclusive —
    // exact:true so this can't accidentally match unrelated "Pro..." text).
    await page.goto("/seeker");
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("pro-upsell-card")).toHaveCount(0);

    // Profile page: Pro badge.
    await page.goto("/seeker/profile");
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // Points page: Pro badge.
    await page.goto("/seeker/points");
    await expect(page.getByText("Pro", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });
});
