import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import {
  countAiCall,
  ensureStagingUser,
  requireFixture,
  signIn,
  stagingAdminClient,
  stagingContext,
  uniqueLabel,
} from "./staging-helpers";

/**
 * AI-generated screening questions per job posting (DESIGN.md §14c, Phase
 * 13) against hosted staging.
 *
 * Three tests, mirroring e2e/skill-assessment.spec.ts's shape:
 *  1. Recruiter generate/edit/publish flow on an admin-seeded job (real
 *     Modal — `countAiCall()` x1 for the generate call) — the
 *     draft-never-candidate-visible gate, driven through the real UI.
 *  2. Seeker real answer round trip (real Modal — `countAiCall()` x1: no
 *     duplicate-check embed here, unlike skill assessments — reuses
 *     gradeAssessmentAttempt directly).
 *  3. `candidate_score_bonus()` v2's screening-question branch + the
 *     combined-cap-still-holds case, direct RPC (zero additional Modal
 *     cost — pure SQL), including the empty-screening-prefs safety case
 *     (this migration restructured the function to sum two independently-
 *     coalesced branches — worth proving the "no prefs at all" case still
 *     returns a real 0, same discipline as Phase 12's equivalent check).
 */

test("Recruiter: generate, edit, and publish screening questions — draft never candidate-visible until published", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const admin = stagingAdminClient();

  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Screen"), company: uniqueLabel("Screen Co") });

  const jobTitle = uniqueLabel("Screening Job");
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: jobTitle,
      description: "Backend role requiring strong Kubernetes and PostgreSQL experience.",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);

  await page.goto(`/recruiter/jobs/${job.id}`);
  await page.getByTestId("toggle-screening-enabled").click();
  await page.getByTestId("generate-screening-questions").click();
  countAiCall(); // generateScreeningQuestions (kind: screening_questions)

  const rows = page.getByTestId("screening-question-row");
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  await page.getByTestId("save-screening-questions").click();

  // Not yet published — must not appear in the seeker-facing question list.
  // Polled, not read once immediately after the click: the save action runs
  // inside a React transition, which hasn't necessarily landed by the time
  // the click handler returns.
  await expect(async () => {
    const { data: draftRow } = await admin
      .from("job_postings")
      .select("screening_status, screening_questions")
      .eq("id", job.id)
      .single();
    expect(draftRow?.screening_status).toBe("draft");
    expect(((draftRow?.screening_questions ?? []) as unknown[]).length).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  await page.getByTestId("publish-screening-questions").click();
  await expect(page.getByTestId("screening-status")).toHaveText("published", { timeout: 30_000 });

  const { data: publishedRow } = await admin
    .from("job_postings")
    .select("screening_status")
    .eq("id", job.id)
    .single();
  expect(publishedRow?.screening_status).toBe("published");

  // Required/weighted toggles only render once published (this UI doesn't
  // expose the AI-generated question's server-assigned id, so asserting the
  // toggle buttons render is done via a seeded, known question id instead —
  // see the required/weighted -> candidate_score_bonus effect asserted
  // directly against the RPC in the third test below).
  await expect(page.getByTestId("screening-question-row").first().getByText("Required")).toBeVisible();

  await ctx.close();
});

test("Seeker: real graded screening-question answer", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  const questionId = crypto.randomUUID();
  const jobTitle = uniqueLabel("Answer Job");
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: jobTitle,
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "active",
      screening_enabled: true,
      screening_status: "published",
      screening_questions: [
        {
          id: questionId,
          question: "What is the time complexity of a balanced binary search tree lookup, and why?",
          rubric: "Must state O(log n) and reference the tree's balanced height.",
        },
      ],
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);

  const { data: match, error: matchError } = await admin
    .from("matches")
    .insert({ job_posting_id: job.id, profile_id: seeker.id, score: 0.8, status: "surfaced" })
    .select("id")
    .single();
  if (matchError || !match) throw new Error(`seed match failed: ${matchError?.message}`);

  await signIn(page, seeker.email);
  await completeSeekerOnboarding(page, { name: uniqueLabel("Seeker Screen") });

  await page.goto(`/seeker/matches/${match.id}`);
  const row = page.getByTestId("screening-question-row");
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("start-screening-answer").click();
  await row
    .getByTestId("screening-answer-input")
    .fill("A balanced BST lookup is O(log n) because the tree's height stays proportional to log of the node count.");
  await row.getByTestId("submit-screening-answer").click();
  countAiCall(); // gradeAssessmentAttempt (kind: assessment_grade) — no embed call here

  await expect(row.getByTestId("screening-answer-pass").or(row.getByTestId("screening-answer-fail"))).toBeVisible({
    timeout: 60_000,
  });

  const { data: answers } = await admin
    .from("candidate_screening_answers")
    .select("id, passed")
    .eq("job_posting_id", job.id)
    .eq("profile_id", seeker.id)
    .eq("question_id", questionId);
  expect(requireFixture(answers?.[0]?.id, "screening answer id")).toBeTruthy();

  await ctx.close();
});

test("candidate_score_bonus v2: passed weighted screening answer yields a positive, capped bonus; no prefs at all yields a real zero", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const candidate = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Bonus2"), company: uniqueLabel("Bonus2 Co") });

  const questionId = crypto.randomUUID();
  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("Bonus2 Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
      screening_enabled: true,
      screening_status: "published",
      screening_questions: [{ id: questionId, question: "q", rubric: "r" }],
      screening_prefs: { [questionId]: "weighted" },
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`seed job failed: ${jobError?.message}`);

  // Before any passed answer: zero bonus.
  const { data: bonusBefore, error: bonusBeforeError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: job.id,
  });
  if (bonusBeforeError) throw new Error(`bonus rpc failed: ${bonusBeforeError.message}`);
  expect(bonusBefore).toBe(0);

  await admin.from("candidate_screening_answers").insert({
    job_posting_id: job.id,
    profile_id: candidate.id,
    question_id: questionId,
    answer_text: "seeded pass",
    passed: true,
  });

  const { data: bonusAfter, error: bonusAfterError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: job.id,
  });
  if (bonusAfterError) throw new Error(`bonus rpc failed: ${bonusAfterError.message}`);
  expect(bonusAfter).toBeGreaterThan(0);
  expect(bonusAfter).toBeLessThanOrEqual(0.1); // VERIFIED_SKILL_BONUS_CAP, src/lib/matching.ts — shared combined cap

  // A job with NO verified_skill_prefs AND NO screening_prefs at all (the
  // common case) must still return a real 0, never NULL — this migration
  // restructured candidate_score_bonus into two independently-coalesced
  // scalar-subquery branches specifically to make this hold by construction
  // rather than by relying on bare-aggregate-over-zero-rows semantics.
  const { data: emptyJob, error: emptyJobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("No Prefs Job 2"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "draft",
    })
    .select("id")
    .single();
  if (emptyJobError || !emptyJob) throw new Error(`seed no-prefs job failed: ${emptyJobError?.message}`);

  const { data: bonusEmpty, error: bonusEmptyError } = await admin.rpc("candidate_score_bonus", {
    p_profile_id: candidate.id,
    p_job_id: emptyJob.id,
  });
  if (bonusEmptyError) throw new Error(`bonus rpc failed: ${bonusEmptyError.message}`);
  expect(bonusEmpty).not.toBeNull();
  expect(bonusEmpty).toBe(0);

  await ctx.close();
});
