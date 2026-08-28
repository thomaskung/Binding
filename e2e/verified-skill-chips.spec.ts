import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { widenMatchFilter } from "./match-helpers";
import {
  ensureStagingProfile,
  ensureStagingUser,
  requireFixture,
  signIn,
  stagingAdminClient,
  stagingContext,
  uniqueLabel,
} from "./staging-helpers";

/**
 * Verified-skill chips + "Verified skills only" filter on the recruiter
 * matches page (Binding.dc.html "verified skills", 18e). Zero Modal cost:
 * candidate/job/match/assessment rows are all seeded directly via the admin
 * client, mirroring skill-assessment.spec.ts's candidate_score_bonus test —
 * the chip-rendering path only needs a `matches` row and a passed
 * `assessment_attempts` row, neither of which requires a real embed/publish
 * round trip (`matches.score` has no embedding-derived constraint, and
 * page.tsx never gates on `job.status`). PR-gate + post-merge-smoke eligible.
 */
test("recruiter matches page: verified-skill chips render and the Verified-only filter narrows the list", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const admin = stagingAdminClient();

  const recruiter = await ensureStagingUser("recruiter");
  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, {
    name: uniqueLabel("Rec Chips"),
    company: uniqueLabel("Chips Co"),
  });

  // One candidate earns a verified badge, one doesn't — proves the filter
  // actually narrows rather than just happening to show everything.
  const verifiedCandidate = await ensureStagingUser("seeker");
  await ensureStagingProfile(verifiedCandidate.id);
  const plainCandidate = await ensureStagingUser("seeker");
  await ensureStagingProfile(plainCandidate.id);

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("Chips Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);
  const jobId = requireFixture(job.id, "job id");

  // status: "interested" (not "surfaced") deliberately — skips the
  // override-availability path entirely and needs no consent_flags row.
  const { error: matchesError } = await admin.from("matches").insert([
    { job_posting_id: jobId, profile_id: verifiedCandidate.id, score: 0.9, status: "interested" },
    { job_posting_id: jobId, profile_id: plainCandidate.id, score: 0.85, status: "interested" },
  ]);
  if (matchesError) throw new Error(`seed matches failed: ${matchesError.message}`);

  const skill = uniqueLabel("ChipSkill");
  const { data: assessment, error: assessmentError } = await admin
    .from("skill_assessments")
    .insert({ skill, prompt: "p", rubric: "r", status: "published" })
    .select("id")
    .single();
  if (assessmentError || !assessment) throw new Error(`seed assessment failed: ${assessmentError?.message}`);

  const { error: attemptError } = await admin.from("assessment_attempts").insert({
    assessment_id: assessment.id,
    profile_id: verifiedCandidate.id,
    answer_text: "seeded pass",
    passed: true,
  });
  if (attemptError) throw new Error(`seed attempt failed: ${attemptError.message}`);

  await page.goto(`/recruiter/jobs/${jobId}/matches`);
  await widenMatchFilter(page); // both seeded scores clear the 55% floor, but not the 70% default

  await expect(page.getByTestId("recruiter-match-card")).toHaveCount(2);

  const verifiedCard = page.getByTestId("recruiter-match-card").filter({
    has: page.getByTestId("verified-skill-chip"),
  });
  await expect(verifiedCard).toHaveCount(1);
  await expect(verifiedCard.getByTestId("verified-skill-chip")).toHaveText(`✓ ${skill}`);

  await verifiedCard.click();
  await expect(
    page.getByTestId("candidate-panel").getByTestId("panel-verified-skill-chip"),
  ).toHaveText(`✓ ${skill}`);

  await page.getByTestId("filter-verified").click();
  await expect(page.getByTestId("recruiter-match-card")).toHaveCount(1);
  await expect(page.getByTestId("recruiter-match-card").getByTestId("verified-skill-chip")).toHaveText(
    `✓ ${skill}`,
  );

  await ctx.close();
});
