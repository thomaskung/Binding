import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * Registration wizard + override-reveal flow, fully self-contained: fresh
 * seeker + recruiter accounts are created via the admin API so this spec
 * never depends on (or disturbs) the seeded demo accounts' balances.
 *
 * recruiter onboards (company) -> posts+publishes job -> seeker onboards
 * (consent wizard) -> publishes matching profile -> does NOT opt in ->
 * recruiter override-reveals (25 pts, name disclosed, messaging locked) ->
 * seeker declines -> recruiter refunded the 15-pt premium.
 */

const PASSWORD = "J0B!Demo#2026$secure";
const SEEKER = { email: "override-seeker@e2e.local", password: PASSWORD };
const RECRUITER = { email: "override-recruiter@e2e.local", password: PASSWORD };

function adminClient() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2];
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function ensureUser(email: string) {
  const admin = adminClient();
  // The auth service can still be booting right after `supabase db reset` —
  // retry transient failures instead of flaking.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user || error?.code === "email_exists") return;
    if (attempt === 5) {
      throw new Error(`createUser failed: ${error?.message ?? JSON.stringify(error)}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter|onboarding)/);
}

test("registration wizard + override reveal + decline refund", async ({ browser }) => {
  await ensureUser(SEEKER.email);
  await ensureUser(RECRUITER.email);

  const recruiterCtx = await browser.newContext();
  const seekerCtx = await browser.newContext();
  const recruiter = await recruiterCtx.newPage();
  const seeker = await seekerCtx.newPage();

  // --- Recruiter registration: chooser -> company form -> dashboard ---
  await signIn(recruiter, RECRUITER);
  await recruiter.waitForURL(/onboarding/);
  await recruiter.getByTestId("choose-recruiter").click();
  await recruiter.waitForURL(/onboarding\/recruiter/);
  await recruiter.getByTestId("recruiter-name").fill("Rita Recruiter");
  await recruiter.getByTestId("recruiter-company").fill("Nimbus Search Group");
  await recruiter.getByTestId("recruiter-tos").check();
  await recruiter.getByTestId("recruiter-continue").click();
  await recruiter.waitForURL(/onboarding\/recruiter\/profile/);

  // Steps 2-3 of the recruiter wizard: company details, then skip the
  // first-job-post hand-off (this test posts its own job explicitly below).
  await recruiter.getByTestId("recruiter-onboarding-industry").fill("Recruiting");
  await recruiter.getByTestId("recruiter-onboarding-continue").click();
  await expect(recruiter.getByTestId("recruiter-onboarding-finish-skip")).toBeVisible();
  await recruiter.getByTestId("recruiter-onboarding-finish-skip").click();
  await recruiter.waitForURL(/\/recruiter\/jobs$/);
  await expect(recruiter.getByTestId("points-balance")).toHaveText("100 points");

  // --- Recruiter posts + publishes a job ---
  await recruiter.goto("/recruiter/jobs/new");
  await recruiter.getByTestId("job-title").fill("Rust Systems Engineer");
  await recruiter.getByTestId("job-description").fill(
    "Rust systems engineer: async runtimes, tokio, low-latency networking, observability tooling, performance profiling.",
  );
  await recruiter.getByTestId("job-salary-max").fill("180000");
  await recruiter.locator('input[name="work_setups"][value="remote"]').check();
  await recruiter.getByTestId("save-job").click();
  await recruiter.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]+$/);
  await recruiter.getByTestId("publish-job").click();
  await expect(recruiter.getByText("Published — matches refreshed.")).toBeVisible({
    timeout: 15_000,
  });

  // --- Seeker registration: chooser -> consent -> resume-first wizard publish ---
  await signIn(seeker, SEEKER);
  await seeker.waitForURL(/onboarding/);
  await seeker.getByTestId("choose-seeker").click();
  await seeker.waitForURL(/onboarding\/seeker/);
  await seeker.getByTestId("onboard-name").fill("Sam Seeker");
  await seeker.getByTestId("onboard-tos").check();
  await seeker.getByTestId("onboard-consent").check();
  await seeker.getByTestId("onboard-continue").click();
  await seeker.waitForURL(/onboarding\/seeker\/profile/);
  await seeker.getByTestId("onboarding-resume-paste").fill(
    "Rust systems engineer: async runtimes, tokio, low-latency networking, observability tooling, performance profiling.",
  );
  await seeker.getByTestId("onboarding-extract").click();
  await expect(seeker.getByTestId("onboarding-continue-dealbreakers")).toBeEnabled({ timeout: 15_000 });
  await seeker.getByTestId("onboarding-continue-dealbreakers").click();
  await seeker.getByTestId("onboarding-finish").click();
  await seeker.waitForURL(/\/seeker$/);

  await seeker.goto("/seeker/profile/resume");
  await expect(seeker.getByTestId("redacted-preview")).toBeVisible({ timeout: 15_000 });

  // Ensure override is allowed (toggle on) — Privacy card on the profile page.
  await seeker.goto("/seeker/profile");
  await seeker.locator('input[name="reveal_override_enabled"]').check();
  await seeker.getByRole("button", { name: "Save settings" }).click();

  // Seeker sees the match but does NOT opt in.
  await seeker.goto("/seeker/matches");
  await expect(seeker.getByTestId("seeker-match-card").first()).toBeVisible();

  // --- Recruiter override-reveals the non-opted-in candidate ---
  await recruiter.getByTestId("view-matches").click();
  await recruiter.getByTestId("override-candidate").click();
  await expect(recruiter.getByTestId("revealed-name")).toHaveText("Sam Seeker", {
    timeout: 15_000,
  });
  await expect(recruiter.getByTestId("override-pending-note")).toBeVisible();
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText("75 points"); // 100 - 25

  // --- Seeker sees the pending override card (earned 5 pts) and declines ---
  await seeker.goto("/seeker");
  await expect(seeker.getByTestId("pending-override-card")).toBeVisible();
  await expect(seeker.getByText("Nimbus Search Group revealed your profile")).toBeVisible();
  await seeker.getByTestId("override-decline").click();
  await expect(seeker.getByTestId("pending-override-card")).toHaveCount(0);

  // --- Recruiter refunded the 15-pt premium: 75 + 15 = 90 ---
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText("90 points");

  await recruiterCtx.close();
  await seekerCtx.close();
});
