import { expect, test, type Page } from "@playwright/test";
import { widenMatchFilter } from "./match-helpers";

/**
 * Walking-skeleton smoke: the full slice with stub AI against the local
 * Supabase stack (run `pnpm db:reset` first for a clean seed).
 *
 * seeker publishes profile -> recruiter posts+publishes job -> seeker sees
 * match, opts in -> recruiter reveals (points move) -> both sides message.
 */

const SEEKER = { email: "seeker@demo.local", password: "J0B!Demo#2026$secure" };
const RECRUITER = { email: "recruiter@demo.local", password: "J0B!Demo#2026$secure" };

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(seeker|recruiter)/);
}

test("full reveal slice", async ({ browser }) => {
  const seekerCtx = await browser.newContext();
  const recruiterCtx = await browser.newContext();
  const seeker = await seekerCtx.newPage();
  const recruiter = await recruiterCtx.newPage();

  // --- Seeker: publish profile (paste-text path) ---
  await signIn(seeker, SEEKER);
  await seeker.goto("/seeker/profile/resume");
  await seeker.getByTestId("profile-draft").fill(
    "Senior backend engineer: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform.",
  );
  await seeker.getByTestId("publish-profile").click();
  await expect(seeker.getByTestId("redacted-preview")).toBeVisible({ timeout: 15_000 });

  // --- Recruiter: create + publish job ---
  await signIn(recruiter, RECRUITER);
  await recruiter.goto("/recruiter/jobs/new");
  await recruiter.getByTestId("job-title").fill("Backend Engineer, Payments");
  await recruiter.getByTestId("job-description").fill(
    "Backend engineer: distributed systems, Postgres, Kubernetes, event-driven pipelines for our payments platform.",
  );
  await recruiter.getByTestId("job-salary-max").fill("150000");
  await recruiter.locator('input[name="work_setups"][value="remote"]').check();
  await recruiter.getByTestId("save-job").click();
  await recruiter.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]+$/);
  await recruiter.getByTestId("publish-job").click();
  await expect(recruiter.getByText("Published — matches refreshed.")).toBeVisible({
    timeout: 15_000,
  });

  // --- Seeker: match surfaced, express interest ---
  await seeker.goto("/seeker/matches");
  const matchCard = seeker.getByTestId("seeker-match-card").first();
  await expect(matchCard).toBeVisible();
  await matchCard.getByTestId("match-interested").click();
  // exact: true — the status BADGE ("interested"), not the "I'm interested"
  // button that substring-matching would hit instantly, before the server
  // write commits (that race let the recruiter see a stale "surfaced" state).
  await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({ timeout: 15_000 });

  // --- Recruiter: reveal (100 -> 90 pts) ---
  // Reveal now happens from the detail panel that pops out when a card is
  // clicked. Widen the min-match filter (default 70%) so a mid-score seed
  // match is never hidden, then open the interested candidate's panel.
  await recruiter.getByTestId("view-matches").click();
  await widenMatchFilter(recruiter);
  await recruiter.getByTestId("recruiter-match-card").filter({ hasText: "interested" }).first().click();
  await expect(recruiter.getByTestId("candidate-panel")).toBeVisible();
  await recruiter.getByTestId("reveal-candidate").click();
  await expect(recruiter.getByTestId("revealed-name")).toHaveText("Demo Seeker", {
    timeout: 15_000,
  });
  await expect(recruiter.getByTestId("fit-summary")).toBeVisible();
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText("90 points");

  // --- Messaging, both directions ---
  await recruiter.goto("/recruiter/jobs");
  await recruiter.getByRole("link", { name: "Backend Engineer, Payments" }).click();
  await recruiter.getByTestId("view-matches").click();
  await widenMatchFilter(recruiter);
  // Revealed candidate now shows their real name on the card; open its panel.
  await recruiter.getByTestId("recruiter-match-card").filter({ hasText: "Demo Seeker" }).first().click();
  await expect(recruiter.getByTestId("candidate-panel")).toBeVisible();
  await recruiter.getByTestId("open-thread").click();
  await recruiter.getByTestId("message-input").fill("Hi! Keen to chat about the payments role.");
  await recruiter.getByTestId("message-send").click();
  await expect(recruiter.getByTestId("message-bubble")).toHaveCount(1);

  await seeker.goto("/seeker/matches");
  await seeker.getByRole("button", { name: "Message recruiter" }).click();
  await expect(seeker.getByTestId("message-bubble")).toHaveCount(1);
  await seeker.getByTestId("message-input").fill("Sounds interesting — tell me more.");
  await seeker.getByTestId("message-send").click();
  await expect(seeker.getByTestId("message-bubble")).toHaveCount(2);

  await seekerCtx.close();
  await recruiterCtx.close();
});
