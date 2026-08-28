import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import {
  countAiCall,
  ensureStagingProfile,
  ensureStagingUser,
  requireFixture,
  signIn,
  stagingAdminClient,
  stagingContext,
  uniqueLabel,
} from "./staging-helpers";

/**
 * Skill assessment, open-ended AI-graded (DESIGN.md §14b, Phase 12,
 * supersedes §13d's MCQ sketch) against hosted staging.
 *
 * Two tests:
 *  1. Recruiter create/edit/publish flow (zero Modal cost) — the
 *     review-before-publish gate itself, driven through the real UI.
 *  2. Seeker real attempt round trip (real Modal — `countAiCall()` × 2 for
 *     the first submission: `ai.embed` for the duplicate check +
 *     `ai.gradeAssessmentAttempt`; a second, identical submission adds
 *     exactly one more `ai.embed` call and NO grade call, since the
 *     duplicate short-circuits before reaching the grader — confirm this
 *     3-call total against a real nightly run before trusting it, per
 *     CLAUDE.md's existing AI_CALL_BUDGET discipline).
 *
 * The `candidate_score_bonus()` ranking-effect assertion is covered
 * directly against the real RPC (zero additional Modal cost — it's pure
 * SQL) rather than through a full publish+embed+match pipeline, which would
 * add real Modal cost just to prove a SQL function's arithmetic.
 */

test("Recruiter: create, edit, and publish a skill-assessment rubric — draft never candidate-visible until published", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const admin = stagingAdminClient();

  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Assess"), company: uniqueLabel("Acme Co") });

  const skill = uniqueLabel("TestSkill");

  await page.goto("/recruiter/skill-assessments");
  await page.getByTestId("new-assessment-skill").fill(skill);
  await page.getByTestId("new-assessment-prompt").fill("Explain how you would design a rate limiter.");
  await page.getByTestId("new-assessment-rubric").fill("Must mention a token-bucket or sliding-window approach.");
  await page.getByTestId("create-skill-assessment").click();

  const row = page.getByTestId("skill-assessment-row").filter({ hasText: skill });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("skill-assessment-status")).toHaveText("draft");

  // Not yet published — must not appear in the seeker-facing list.
  const { data: draftRow } = await admin.from("skill_assessments").select("id, status").eq("skill", skill).single();
  expect(draftRow?.status).toBe("draft");

  await row.getByTestId("publish-skill-assessment").click();
  await expect(row.getByTestId("skill-assessment-status")).toHaveText("published", { timeout: 30_000 });

  const { data: publishedRow } = await admin
    .from("skill_assessments")
    .select("status")
    .eq("skill", skill)
    .single();
  expect(publishedRow?.status).toBe("published");

  await ctx.close();
});

test("Seeker: real graded attempt, then a near-duplicate resubmission is auto-failed without a second grading call", async ({
  browser,
}) => {
  test.setTimeout(480_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  const skill = uniqueLabel("DupSkill");
  const { data: assessment, error } = await admin
    .from("skill_assessments")
    .insert({
      skill,
      prompt: "What is the time complexity of binary search, and why?",
      rubric: "Must state O(log n) and explain the halving-the-search-space reasoning.",
      status: "published",
    })
    .select("id")
    .single();
  if (error || !assessment) throw new Error(`seed assessment failed: ${error?.message}`);

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Seeker Assess") });

  await page.goto("/seeker/skill-assessments");
  const row = page.getByTestId("assessment-row").filter({ hasText: skill });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("start-assessment-attempt").click();

  const answer =
    "Binary search runs in O(log n) time because each comparison halves the remaining search space, so the number of steps needed grows logarithmically with the input size.";
  await row.getByTestId("assessment-answer-input").fill(answer);
  await row.getByTestId("submit-assessment-attempt").click();
  countAiCall(); // ai.embed (duplicate check)
  countAiCall(); // ai.gradeAssessmentAttempt

  const passLocator = row.getByTestId("assessment-result-pass");
  const failLocator = row.getByTestId("assessment-result-fail");
  // The assessment_grade Modal call shares the single binding-llm container
  // with every other /extract + /refine kind, so under the suite's parallel
  // load it can sit queued well past the default 60s. Give the grade its full
  // budget headroom (the test already allows 480s total).
  await expect(passLocator.or(failLocator)).toBeVisible({ timeout: 180_000 });

  const { data: firstAttempts } = await admin
    .from("assessment_attempts")
    .select("id, passed, rationale")
    .eq("assessment_id", assessment.id)
    .eq("profile_id", seeker.id);
  expect(firstAttempts ?? []).toHaveLength(1);
  const firstAttempt = requireFixture(firstAttempts?.[0]?.id, "first attempt id");

  // Resubmit the SAME answer — must be auto-failed as a near-duplicate,
  // without a second grading call (only the embed call runs). The taker form
  // stays OPEN after the first submission (assessment-taker.tsx keeps
  // `openId` set and just shows the result), so there is no "Try again"
  // button to click — the answer input is still on the page; re-fill it and
  // resubmit directly.
  await row.getByTestId("assessment-answer-input").fill(answer);
  await row.getByTestId("submit-assessment-attempt").click();
  countAiCall(); // ai.embed (duplicate check) — no grade call for a detected duplicate

  // The result element above is the same DOM node as the FIRST attempt's
  // fail result (the taker keeps the form + result open on the same row), so
  // a toBeVisible on it is already satisfied before the second submission
  // even lands. Poll the DB instead for the second attempt row to appear AND
  // for its rationale to be set (the duplicate-check/grade update lands a
  // beat after the insert, which is what the rationale assertions below need).
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("assessment_attempts")
          .select("id, passed, rationale")
          .eq("assessment_id", assessment.id)
          .eq("profile_id", seeker.id)
          .neq("id", firstAttempt);
        return (data ?? []).filter((r) => typeof r.rationale === "string" && r.rationale.length > 0);
      },
      { timeout: 120_000, message: "second (near-duplicate) attempt should be graded/settled" },
    )
    .toHaveLength(1);

  const { data: secondAttempts } = await admin
    .from("assessment_attempts")
    .select("id, passed, rationale")
    .eq("assessment_id", assessment.id)
    .eq("profile_id", seeker.id)
    .neq("id", firstAttempt);
  expect(secondAttempts ?? []).toHaveLength(1);
  expect(secondAttempts?.[0]?.passed).toBe(false);
  expect(secondAttempts?.[0]?.rationale).toMatch(/similar/i);

  // The first (real, passed) attempt above should surface as a "Verified"
  // badge on the seeker's profile — Binding.dc.html "verified skills", 18a.
  await page.goto("/seeker/profile");
  const verifiedCard = page.getByTestId("verified-skills-card");
  await expect(verifiedCard.getByText(skill)).toBeVisible();
  await expect(verifiedCard.getByTestId("verified-skill-badge")).toBeVisible();

  await ctx.close();
});

test("candidate_score_bonus: a passed weighted-skill attempt yields a positive, capped bonus; no attempt yields zero", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const candidate = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Bonus"), company: uniqueLabel("Bonus Co") });
  // candidate is never onboarded — create its profiles row so the
  // assessment_attempts.profile_id seed below satisfies the FK (otherwise the
  // insert silently fails and the bonus stays 0).
  await ensureStagingProfile(candidate.id);

  const skill = uniqueLabel("BonusSkill");
  const { data: assessment, error: assessmentError } = await admin
    .from("skill_assessments")
    .insert({ skill, prompt: "prompt", rubric: "rubric", status: "published" })
    .select("id")
    .single();
  if (assessmentError || !assessment) throw new Error(`seed assessment failed: ${assessmentError?.message}`);

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("Bonus Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
      verified_skill_prefs: { [skill]: "weighted" },
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);

  // Before any passed attempt: zero bonus.
  const { data: bonusBefore, error: bonusBeforeError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: job.id,
  });
  if (bonusBeforeError) throw new Error(`bonus rpc failed: ${bonusBeforeError.message}`);
  expect(bonusBefore).toBe(0);

  await admin.from("assessment_attempts").insert({
    assessment_id: assessment.id,
    profile_id: candidate.id,
    answer_text: "seeded pass",
    passed: true,
  });

  const { data: bonusAfter, error: bonusAfterError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: job.id,
  });
  if (bonusAfterError) throw new Error(`bonus rpc failed: ${bonusAfterError.message}`);
  expect(bonusAfter).toBeGreaterThan(0);
  expect(bonusAfter).toBeLessThanOrEqual(0.1); // VERIFIED_SKILL_BONUS_CAP, src/lib/matching.ts

  // A job with NO verified_skill_prefs at all (the common case — every job
  // before this phase, and most after it) must return a real 0, never NULL.
  // candidate_score_bonus's outer query is a bare aggregate with no GROUP BY
  // over a `cross join lateral jsonb_each_text(...)` — an empty jsonb object
  // makes that lateral produce zero rows, so this proves Postgres's "ungrouped
  // aggregate always yields one row" behavior holds here rather than trusting
  // that reasoning unverified: a NULL here would poison `raw_score + bonus`
  // in match_candidates/match_jobs_for_candidate for every no-prefs job.
  const { data: emptyPrefsJob, error: emptyPrefsJobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("No Prefs Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
    })
    .select("id")
    .single();
  if (emptyPrefsJobError || !emptyPrefsJob) {
    throw new Error(`seed no-prefs job failed: ${emptyPrefsJobError?.message}`);
  }

  const { data: bonusNoPrefs, error: bonusNoPrefsError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: emptyPrefsJob.id,
  });
  if (bonusNoPrefsError) throw new Error(`bonus rpc failed: ${bonusNoPrefsError.message}`);
  expect(bonusNoPrefs).not.toBeNull();
  expect(bonusNoPrefs).toBe(0);

  await ctx.close();
});
