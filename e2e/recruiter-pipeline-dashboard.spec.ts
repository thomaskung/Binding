import { expect, test } from "@playwright/test";
import { ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * Recruiter Pipeline command-center (`/recruiter`) + Candidates split
 * (`/recruiter/candidates`) against hosted staging — a new aggregation/
 * presentation layer over existing data, so this spec seeds state directly
 * via the service-role admin client rather than driving the real
 * publish/match pipeline: zero Modal AI cost, and it lets the scenario pin
 * exact match statuses/timestamps the real embedding pipeline can't
 * guarantee (a specific stale posting, a specific expiring override, one
 * candidate matched to two postings).
 *
 * `profiles.id` FKs to `auth.users.id`, so every fake "candidate" still needs
 * a real auth user via `ensureStagingUser("seeker")` — but never signs in;
 * it exists purely as a valid FK target for `matches.profile_id`.
 *
 * Scenario (all timestamps relative to test run time):
 *   job1 (fresh):  A interested (now), B revealed (now), C surfaced (now)
 *   job2 (stale):  A surfaced (8d ago) — A matched to BOTH postings —
 *                  C declined (8d ago)
 *   reveal_requests: one override, pending, created 6d ago, on C's job1
 *                    match — lands in the "expiring reveal" window (5–7d).
 *
 * Expected 3-stage aggregate funnel (Matched -> Interested -> Revealed),
 * computed as ONE query across BOTH jobs (not summed per-posting — the
 * regression this spec exists to catch):
 *   matched = 4 (all except C's declined job2 row)
 *   interested = 2 (A-job1 interested + B-job1 revealed)
 *   revealed = 1 (B-job1)
 */
test("pipeline command-center funnel + alerts + posting health, and Candidates parity", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const admin = stagingAdminClient();
  const recruiterUser = await ensureStagingUser("recruiter");
  const candidateA = await ensureStagingUser("seeker");
  const candidateB = await ensureStagingUser("seeker");
  const candidateC = await ensureStagingUser("seeker");

  const recruiterName = uniqueLabel("Pia Pipeline");
  const job1Title = uniqueLabel("Pipeline Fresh Role");
  const job2Title = uniqueLabel("Pipeline Stale Role");

  // Migration 0004 dropped the `role` enum in favor of is_seeker/is_recruiter
  // flags (dual-role accounts) — only the flags are valid columns today.
  const { error: recruiterProfileError } = await admin.from("profiles").insert({
    id: recruiterUser.id,
    is_recruiter: true,
    display_name: recruiterName,
  });
  if (recruiterProfileError) throw new Error(`recruiter profile seed failed: ${recruiterProfileError.message}`);

  for (const candidate of [candidateA, candidateB, candidateC]) {
    const { error } = await admin.from("profiles").insert({
      id: candidate.id,
      is_seeker: true,
      display_name: uniqueLabel("Pipeline Candidate"),
    });
    if (error) throw new Error(`candidate profile seed failed: ${error.message}`);
  }

  const { data: job1, error: job1Error } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiterUser.id,
      title: job1Title,
      description: "Fresh posting for the pipeline dashboard e2e scenario.",
      status: "active",
      // salary bounds are NOT NULL since migration 0024.
      salary_min: 80000,
      salary_max: 150000,
    })
    .select("id")
    .single();
  if (job1Error || !job1) throw new Error(`job1 seed failed: ${job1Error?.message}`);

  const { data: job2, error: job2Error } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiterUser.id,
      title: job2Title,
      description: "Stale posting for the pipeline dashboard e2e scenario.",
      status: "active",
      salary_min: 80000,
      salary_max: 150000,
    })
    .select("id")
    .single();
  if (job2Error || !job2) throw new Error(`job2 seed failed: ${job2Error?.message}`);

  const now = new Date().toISOString();
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

  const { data: matchRows, error: matchesError } = await admin
    .from("matches")
    .insert([
      { job_posting_id: job1.id, profile_id: candidateA.id, score: 0.8, status: "interested", created_at: now },
      { job_posting_id: job1.id, profile_id: candidateB.id, score: 0.6, status: "revealed", created_at: now },
      { job_posting_id: job1.id, profile_id: candidateC.id, score: 0.55, status: "surfaced", created_at: now },
      { job_posting_id: job2.id, profile_id: candidateA.id, score: 0.7, status: "surfaced", created_at: eightDaysAgo },
      { job_posting_id: job2.id, profile_id: candidateC.id, score: 0.5, status: "declined", created_at: eightDaysAgo },
    ])
    .select("id, job_posting_id, profile_id");
  if (matchesError || !matchRows) throw new Error(`matches seed failed: ${matchesError?.message}`);

  const job1CandidateCMatch = matchRows.find(
    (m) => m.job_posting_id === job1.id && m.profile_id === candidateC.id,
  );
  if (!job1CandidateCMatch) throw new Error("expected job1/candidateC match row not found after insert");

  const { error: revealError } = await admin.from("reveal_requests").insert({
    match_id: job1CandidateCMatch.id,
    job_posting_id: job1.id,
    profile_id: candidateC.id,
    recruiter_id: recruiterUser.id,
    path: "override",
    status: "pending",
    created_at: sixDaysAgo,
  });
  if (revealError) throw new Error(`reveal_requests seed failed: ${revealError.message}`);

  const recruiterCtx = await stagingContext(browser);
  const recruiter = await recruiterCtx.newPage();
  await signIn(recruiter, recruiterUser.email);

  // --- Pipeline command-center: 3-stage funnel, single aggregate across both jobs ---
  await recruiter.goto("/recruiter");
  await expect(recruiter.getByRole("heading", { name: "Pipeline" })).toBeVisible({ timeout: 30_000 });
  const funnelSection = recruiter.locator("main");
  await expect(funnelSection.getByText("Matched", { exact: true })).toBeVisible();
  // Values render as bare numbers above their labels — scope to the funnel
  // card so "4"/"2"/"1" can't accidentally match unrelated page text.
  const funnelCard = recruiter.locator("main > div").filter({ hasText: "Matched" }).first();
  await expect(funnelCard.getByText("4", { exact: true })).toBeVisible();
  await expect(funnelCard.getByText("2", { exact: true })).toBeVisible();
  await expect(funnelCard.getByText("1", { exact: true })).toBeVisible();

  // --- Alerts: stale posting (job2) + expiring override reveal (job1/C) ---
  await expect(recruiter.getByText("No new matches in 7 days")).toBeVisible();
  // job2Title appears TWICE on /recruiter: as the stale-alert paragraph AND as
  // the posting link in the health section. Scope to the first so the strict
  // locator doesn't fail on the ambiguity (both prove the title renders).
  await expect(recruiter.getByText(job2Title).first()).toBeVisible();
  await expect(recruiter.getByText(/Reveal expiring in \d+ days?/)).toBeVisible();

  // --- Posting health: cohort sizes per job (3 on job1, 2 on job2) ---
  await expect(recruiter.getByText(job1Title).first()).toBeVisible();
  await expect(recruiter.getByText("3 matches")).toBeVisible();
  await expect(recruiter.getByText("2 matches")).toBeVisible();

  // --- Candidates route: same underlying match rows (5 total across both jobs) ---
  await recruiter.goto("/recruiter/candidates");
  await expect(recruiter.getByText("5 candidates match your open roles")).toBeVisible({ timeout: 30_000 });

  await recruiterCtx.close();
});
