import { expect, test } from "@playwright/test";
import { createAndPublishJob, publishMatchingProfile, widenMatchFilter } from "./match-helpers";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { countAiCall, ensureStagingUser, signIn, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Walking-skeleton smoke: the full slice against hosted staging (real Modal
 * AI, a shared never-reset DB) — fresh seeker + recruiter accounts created
 * per run via the admin API (`ensureStagingUser`), never the retired local
 * seeded `seeker@demo.local` / `recruiter@demo.local` logins.
 *
 * seeker publishes profile -> recruiter posts+publishes job -> seeker sees
 * match, opts in -> recruiter reveals (points move) -> both sides message.
 *
 * One published profile, one published job, one reveal for the whole
 * journey — nothing republishes. Modal AI cost: 4 round-trips total
 * (ai.redact + ai.embed via `publishMatchingProfile`, ai.embed via
 * `createAndPublishJob`, ai.fitSummary on the standard reveal — counted
 * inline here, matching staging-functional.spec.ts test 8's placement).
 */

test("full reveal slice", async ({ browser }) => {
  // The journey chains several Modal round-trips (each given 60s cold-start
  // headroom below) plus two cold-lambda logins and two onboarding walks —
  // comfortably past playwright.config.ts's 120s default test timeout.
  test.setTimeout(420_000);

  const seekerCtx = await stagingContext(browser);
  const recruiterCtx = await stagingContext(browser);
  const seeker = await seekerCtx.newPage();
  const recruiter = await recruiterCtx.newPage();

  const seekerUser = await ensureStagingUser("seeker");
  const recruiterUser = await ensureStagingUser("recruiter");
  const seekerName = uniqueLabel("Demo Seeker");

  // --- Seeker: onboard (wizard-skip, free) then publish profile (paste-text path) ---
  await signIn(seeker, seekerUser.email);
  await completeSeekerOnboarding(seeker, { name: seekerName });
  await publishMatchingProfile(seeker);

  // --- Recruiter: onboard then create + publish job ---
  await signIn(recruiter, recruiterUser.email);
  await completeRecruiterOnboarding(recruiter, {
    name: uniqueLabel("Rex Recruiter"),
    company: uniqueLabel("Nimbus Search Group"),
  });
  const { jobId } = await createAndPublishJob(recruiter);

  // --- Seeker: match surfaced, express interest ---
  await seeker.goto("/seeker/matches");
  const matchCard = seeker.getByTestId("seeker-match-card").first();
  await expect(matchCard).toBeVisible({ timeout: 60_000 });
  await matchCard.getByTestId("match-interested").click();
  // exact: true — the status BADGE ("interested"), not the "I'm interested"
  // button that substring-matching would hit instantly, before the server
  // write commits (that race let the recruiter see a stale "surfaced" state).
  await expect(matchCard.getByText("Interested", { exact: true })).toBeVisible({ timeout: 15_000 });

  // --- Recruiter: reveal (100 -> 90 pts) ---
  // Reveal happens from the detail panel that pops out when a card is
  // clicked. Widen the min-match filter (default 70%) so the fresh match is
  // never hidden, then open the interested candidate's panel.
  await recruiter.goto(`/recruiter/jobs/${jobId}`);
  await recruiter.getByTestId("view-matches").click();
  await widenMatchFilter(recruiter);
  await recruiter.getByTestId("recruiter-match-card").filter({ hasText: "interested" }).first().click();
  await expect(recruiter.getByTestId("candidate-panel")).toBeVisible({ timeout: 15_000 });
  countAiCall(); // ai.fitSummary on reveal
  await recruiter.getByTestId("reveal-candidate").click();
  await recruiter.getByTestId("confirm-reveal").click();
  await expect(recruiter.getByTestId("revealed-name")).toHaveText(seekerName, {
    timeout: 60_000,
  });
  await expect(recruiter.getByTestId("fit-summary")).toBeVisible({ timeout: 60_000 });
  await recruiter.goto("/recruiter/jobs");
  await expect(recruiter.getByTestId("points-balance")).toHaveText("90 points");

  // --- Messaging, both directions ---
  await recruiter.goto(`/recruiter/jobs/${jobId}`);
  await recruiter.getByTestId("view-matches").click();
  await widenMatchFilter(recruiter);
  // Revealed candidate now shows their real name on the card; open its panel.
  await recruiter.getByTestId("recruiter-match-card").filter({ hasText: seekerName }).first().click();
  await expect(recruiter.getByTestId("candidate-panel")).toBeVisible({ timeout: 15_000 });
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
