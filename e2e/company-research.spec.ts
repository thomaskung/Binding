import { expect, test } from "@playwright/test";
import { completeRecruiterOnboarding } from "./recruiter-onboarding";
import { completeSeekerOnboarding } from "./seeker-onboarding";
import { countAiCall, ensureStagingProfile, ensureStagingUser, signIn, stagingAdminClient, stagingContext, uniqueLabel } from "./staging-helpers";

/**
 * AI Company Research (DESIGN.md §14k, Phase 14) against hosted staging.
 *
 * One test, two views of the same match page:
 *  1. First view: click "Research this company" — real web-search (Brave,
 *     NOT tracked by countAiCall() — that mechanism is Modal-specific by
 *     name and by every existing call site, same untracked posture as
 *     Google Drive's `files.list`/`export` quota spend) + real Modal
 *     summarization (`countAiCall()` x1).
 *  2. Second view (fresh page load, fresh component mount): click "Research
 *     this company" again — cache hit, zero additional Modal or search
 *     calls. Asserted two ways: (a) no additional `countAiCall()` mark, so
 *     a regression trips the suite's overall `AI_CALL_BUDGET` ceiling; (b)
 *     a direct DB check that `company_research_cache` still has exactly one
 *     row for this job (not a duplicate insert on the second view) and that
 *     the summary returned matches it byte-for-byte.
 *
 * Requires `WEB_SEARCH_API_KEY` (Brave Search API) to be configured on
 * staging in addition to the `modal deploy` this phase's `COMPANY_RESEARCH_SYSTEM`
 * branch needs — see CLAUDE.md Gotchas. Until both land, this test fails
 * against real staging (nightly-tier only, not in the PR gate).
 */

test("Seeker: research a company, then a second view hits the cache with zero additional calls", async ({ browser }) => {
  test.setTimeout(480_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  const companyName = uniqueLabel("Research Co");
  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Research"), company: companyName });
  // seeker is seeded into matches below BEFORE it onboards — create its
  // profiles row so the FK insert doesn't violate matches_profile_id_fkey.
  await ensureStagingProfile(seeker.id, { seeker: true });

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("Research Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "active",
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
  await completeSeekerOnboarding(page, { name: uniqueLabel("Seeker Research") });

  // --- First view: real search + real Modal summarization ---
  await page.goto(`/seeker/matches/${match.id}`);
  const card = page.getByTestId("company-research-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId("research-company").click();
  countAiCall(); // Modal /refine (kind: company_research) — the Brave search itself is untracked, see file doc comment

  const summaryLocator = card.getByTestId("company-research-summary");
  await expect(summaryLocator).toBeVisible({ timeout: 60_000 });
  await expect(card.getByTestId("company-research-disclaimer")).toContainText(/AI-researched/i);

  const { data: cacheRows } = await admin.from("company_research_cache").select("summary").eq("job_posting_id", job.id);
  expect(cacheRows ?? []).toHaveLength(1);
  const storedSummary = cacheRows?.[0]?.summary ?? "";
  expect(storedSummary.length).toBeGreaterThan(0);

  // --- Second view: fresh page load, fresh component mount, cache hit ---
  await page.goto(`/seeker/matches/${match.id}`);
  const card2 = page.getByTestId("company-research-card");
  await expect(card2).toBeVisible({ timeout: 30_000 });
  await card2.getByTestId("research-company").click();
  // No countAiCall() here — a cache hit must make zero additional Modal or
  // search calls. If the implementation regresses to re-fetching, the
  // suite's real (untracked-here) call count silently grows and the CI
  // AI_CALL_BUDGET sum eventually catches it.

  const summaryLocator2 = card2.getByTestId("company-research-summary");
  await expect(summaryLocator2).toBeVisible({ timeout: 30_000 });
  // Compared against the DB row (source of truth for "cache hit returned the
  // stored value"), not against a first-view textContent() snapshot —
  // toHaveText() whitespace-normalizes internally, which a raw textContent()
  // capture would not, risking a flake on LLM prose with paragraph breaks.
  await expect(summaryLocator2).toHaveText(storedSummary);

  const { data: cacheRowsAfter } = await admin
    .from("company_research_cache")
    .select("id")
    .eq("job_posting_id", job.id);
  expect(cacheRowsAfter ?? []).toHaveLength(1);

  await ctx.close();
});

// Smoke job variant: card renders with zero AI or search calls (skips click, skips countAiCall()).
test("Seeker: company research card renders with zero AI or search calls", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await stagingContext(browser);
  const page = await ctx.newPage();
  const recruiter = await ensureStagingUser("recruiter");
  const seeker = await ensureStagingUser("seeker");
  const admin = stagingAdminClient();

  // Onboard the recruiter before seeding, matching this file's own real-cost
  // test above — kept for consistency within the file even though other
  // specs (e.g. skill-assessment.spec.ts's candidate_score_bonus test) use a
  // bare ensureStagingUser() id as an FK target with no onboarding at all, so
  // it isn't proven strictly required.
  await signIn(page, recruiter.email);
  await completeRecruiterOnboarding(page, { name: uniqueLabel("Rec Smoke"), company: uniqueLabel("Smoke Co") });

  const { data: job, error: jobError } = await admin
    .from("job_postings")
    .insert({
      recruiter_id: recruiter.id,
      title: uniqueLabel("Smoke Job"),
      description: "d",
      salary_min: 1,
      salary_max: 1,
      work_setups: ["remote"],
      status: "active",
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
  await completeSeekerOnboarding(page, { name: uniqueLabel("Seeker Smoke") });

  await page.goto(`/seeker/matches/${match.id}`);
  await expect(page.getByTestId("company-research-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("research-company")).toBeVisible();

  await ctx.close();
});
