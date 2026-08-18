/**
 * Seed the hosted STAGING Supabase with the comprehensive demo dataset:
 * 50 seekers + 20 jobs across 20 role families (tech + finance) + 8 companies,
 * PLUS scenario coverage for every feature shipped since the original
 * smoke seed (screening questions, skill assessments, company research,
 * referrals, agent tokens, connected accounts, key custody, the reveal ->
 * messaging -> interview chain, training/benefits, structured work history,
 * tier/consent/salary-stealth/equity variance, dual-role accounts).
 *
 *   pnpm tsx scripts/seed-staging.ts                        # reseed staging (smoke/demo domains only)
 *   pnpm tsx scripts/seed-staging.ts --no-wipe               # keep existing @smoke.local users
 *   pnpm tsx scripts/seed-staging.ts --include-staging-local # ALSO wipe @staging.local e2e cruft (one-time full reset — see CLAUDE.md/plan)
 *   pnpm tsx scripts/seed-staging.ts --verify                # after seeding, count rows in every new table and fail loud on any zero
 *
 * Unlike the tracked local smoke seed (test-data/, STUB embeddings + no live
 * AI/DB calls), this uses the REAL Modal embedder/LLM/web-search so match
 * scores and the AI-derived entities below are consistent with the live app.
 * The base dataset DEFINITION is shared with the local seed — imported
 * straight from test-data/generate-smoke-seed.ts (single source of truth).
 *
 * Reads from .env.local: SUPABASE_SERVICE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * MODAL_API_TOKEN (+ optional MODAL_EMBED_URL override), WEB_SEARCH_API_KEY
 * (company research). Sets AI_PROVIDER=modal for the duration of this
 * process so getAiProvider() resolves to the real Modal-backed provider.
 *
 * Logins after seeding (demo password J0B!Demo#2026$secure): any recruiter
 * (nimbus@smoke.local, harbour@smoke.local, …) or seeker (backend1@smoke.local, …).
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertCompanyIdentifier, assertJDTextOnly, getAiProvider } from "../src/lib/ai";
import { hashAgentToken } from "../src/lib/agent-mcp";
import { credentialsFloorSummary } from "../src/lib/credentials";
import { seniorityBand } from "../src/lib/experience";
import { logPiiAccess } from "../src/lib/pii-audit";
import {
  earnSkillAssessmentPass,
  OVERRIDE_COMPENSATION,
  OVERRIDE_COST,
  OVERRIDE_PREMIUM_REFUND,
  REVEAL_COMPENSATION,
  REVEAL_COST,
  SKILL_ASSESSMENT_PASS_POINTS,
} from "../src/lib/points";
import { costForSeeker, rewardTrainingCompletion, spendTrainingCredits } from "../src/lib/training";
import {
  assignRecruiterTiers,
  buildAgentTokenPlan,
  buildConnectedAccountPlan,
  buildJobs,
  buildKeyCustody,
  buildReferralPlan,
  buildSeeker,
  buildSeekerExperience,
  SEEKER_COUNT,
  type RecruiterJson,
} from "../test-data/generate-smoke-seed";

// --- env -----------------------------------------------------------------
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA_URL = env.SUPABASE_SERVICE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MODAL_TOKEN = env.MODAL_API_TOKEN;
// Non-null assertion: the runtime guard below is the real check. It's used
// inside closures, where TS control-flow narrowing doesn't propagate.
const EMBED_URL = env.MODAL_EMBED_URL!;
if (!SUPA_URL || !SUPA_KEY) throw new Error("missing SUPABASE_SERVICE_URL / SERVICE_ROLE_KEY");
if (!MODAL_TOKEN) throw new Error("missing MODAL_API_TOKEN");
if (!EMBED_URL) throw new Error("missing MODAL_EMBED_URL — set it in .env.local (no hardcoded Modal URLs)");
if (!/supabase\.co/.test(SUPA_URL)) throw new Error(`refusing: SUPABASE_SERVICE_URL is not hosted (${SUPA_URL})`);
for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
process.env.AI_PROVIDER = "modal"; // real generation for screening/assessment/company-research (decision: real, not stubbed)
const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const PASSWORD = "J0B!Demo#2026$secure";
const CONSENT_V = "2026-07-28-draft";
// Both seed domains: @smoke.local (this dataset) and @demo.local (the retired
// ccmf-app seeder's accounts) — clear both so staging isn't a mix of old + new.
const SEED_DOMAINS = ["@smoke.local", "@demo.local"];
const INCLUDE_STAGING_LOCAL = process.argv.includes("--include-staging-local");
const VERIFY = process.argv.includes("--verify");

type Recruiter = RecruiterJson & { recruiterTier: "free" | "solo" | "advanced" | "pro_saas" };

// --- Modal embed (direct, warm-up + retry for cold starts) --------------
async function embed(text: string): Promise<number[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MODAL_TOKEN}` },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const { embedding } = (await res.json()) as { embedding: number[] };
      if (Array.isArray(embedding) && embedding.length) return embedding;
      throw new Error("embed returned no vector");
    }
    if (res.status === 401) throw new Error("Modal 401 — MODAL_API_TOKEN mismatch");
    await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  throw new Error("embed failed after retries");
}

/** Finds a user by email across ALL pages — not just the first 1000. On a
 * staging project with heavy e2e/PR-gate churn, total auth.users easily
 * exceeds 1000 and a target email (especially an OLDER @smoke.local/
 * @demo.local account) can sort well past that window, so a single-page
 * lookup silently misses it. */
async function findUserByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
    if (error) throw new Error(`listUsers page ${page} failed: ${error.message}`);
    const u = data.users.find((x) => x.email === email);
    if (u) return u.id;
    if (data.users.length < 1000) return null; // last page
  }
  throw new Error(`findUserByEmail(${email}): exceeded page guard without finding user or reaching the last page`);
}

async function ensureUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (data.user) return data.user.id;
  if (error?.code === "email_exists") {
    const existing = await findUserByEmail(email);
    if (existing) return existing;
  }
  throw new Error(`createUser(${email}): ${error?.message}`);
}

/** Deletes rows in tables that reference a profile via a plain (non-
 * cascading) FK — currently only skill_assessments.created_by (migration
 * 0033 has no `on delete` clause, so it defaults to RESTRICT and blocks
 * deleting the referenced user). Discovered empirically: deleting a large
 * batch of @staging.local test accounts hit "Database error deleting user"
 * for every account that had ever created a (test) skill assessment.
 * Deleting these test-created rows here (not just nulling created_by) is
 * correct for @staging.local/@smoke.local/@demo.local test accounts —
 * they're not the durable catalog content (that's the 0010/0011 migration
 * seed rows, which have no created_by/FK to any deletable account). */
async function clearNonCascadingReferences(profileId: string): Promise<void> {
  await admin.from("skill_assessments").delete().eq("created_by", profileId);
}

/** Delete the seed accounts (@smoke.local + @demo.local, and — only with
 * --include-staging-local — @staging.local too) — cascades their
 * marketplace data — so re-seeding is clean. Paginates by always fetching
 * page 1 and deleting until none remain (matching users shift into view as
 * earlier ones are removed).
 *
 * --include-staging-local is the one-time full wipe (plan Part 2): before
 * running it, confirm no PR-gate or nightly e2e run is in flight
 * (`gh run list --workflow=ci.yml --status=in_progress` and the same for
 * e2e-staging.yml) — @staging.local is shared with every such run and has
 * no per-run id to filter on, so wiping it while one is executing deletes
 * that run's own test data out from under it. Even then, expect a handful
 * of @staging.local stragglers to reappear afterward from CI runs that
 * start during/after the wipe — that's ordinary churn, not a bug; the
 * ongoing nightly cleanup job sweeps those, and they never collide with
 * this script's own fixed @smoke.local/@demo.local email list either way. */
async function wipeSeedUsers() {
  const domains = INCLUDE_STAGING_LOCAL ? [...SEED_DOMAINS, "@staging.local"] : SEED_DOMAINS;
  console.log(`RESET: deleting ${domains.join(" / ")} users (cascades their data)…`);
  let deleted = 0;
  const failedEmails = new Set<string>(); // skip on retry so one stuck user can't burn the whole guard budget
  for (let guard = 0; guard < 2000; guard++) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listError) throw new Error(`listUsers failed: ${listError.message}`);
    const seed = data.users.filter((u) => domains.some((d) => u.email?.endsWith(d)) && !failedEmails.has(u.email!));
    if (!seed.length) break;
    for (const u of seed) {
      await clearNonCascadingReferences(u.id);
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) {
        failedEmails.add(u.email!);
        console.error(`  FAILED to delete ${u.email}: ${error.message}`);
      } else {
        deleted++;
      }
    }
  }
  console.log(
    `  deleted ${deleted} seed users${failedEmails.size ? `, ${failedEmails.size} FAILED (see errors above — investigate before trusting the reseed is complete)` : ""}`,
  );
}

// --- Abort-and-revert tracking for the live/AI pass -----------------------
// Only mutable CONTENT the AI pass creates is tracked/reverted on failure —
// never append-only/audit rows (points_ledger, pii_access_log,
// company_research_requests, verified_actions), which stay exactly as
// written even from an aborted run, same posture as wipeSeedUsers()
// sanitizing (not deleting) points_ledger rows elsewhere in this file.
const revertTracking = {
  jobIdsWithScreening: new Set<string>(), // reset screening_* columns to defaults
  skillAssessmentIds: new Set<string>(),
  assessmentAttemptIds: new Set<string>(),
  companyResearchCacheJobIds: new Set<string>(),
};

async function revertAiPassContent(): Promise<void> {
  console.error("Live/AI pass failed — reverting partial content (append-only logs/ledger untouched)…");
  if (revertTracking.assessmentAttemptIds.size) {
    await admin.from("assessment_attempts").delete().in("id", [...revertTracking.assessmentAttemptIds]);
  }
  if (revertTracking.skillAssessmentIds.size) {
    await admin.from("skill_assessments").delete().in("id", [...revertTracking.skillAssessmentIds]);
  }
  if (revertTracking.companyResearchCacheJobIds.size) {
    await admin.from("company_research_cache").delete().in("job_posting_id", [...revertTracking.companyResearchCacheJobIds]);
  }
  if (revertTracking.jobIdsWithScreening.size) {
    await admin
      .from("job_postings")
      .update({ screening_enabled: false, screening_questions: [], screening_status: "draft", screening_prefs: {} })
      .in("id", [...revertTracking.jobIdsWithScreening]);
  }
  console.error("  revert complete.");
}

async function main() {
  // Pre-flight BEFORE the destructive wipe: confirm Modal auth + 1024-dim.
  const probe = await embed("staging seed preflight: backend engineer, go, postgres");
  console.log(`pre-flight embed OK: dim=${probe.length}`);
  if (probe.length !== 1024) throw new Error(`embed dim ${probe.length} != 1024`);

  if (!process.argv.includes("--no-wipe")) await wipeSeedUsers();

  // --- recruiters (8 companies, tech + finance, tiered) ---
  const recruiterDefs = assignRecruiterTiers(
    JSON.parse(readFileSync(new URL("../test-data/smoke-recruiters.json", import.meta.url), "utf8")) as RecruiterJson[],
  );
  const recruiters: Recruiter[] = [];
  for (const [i, r] of recruiterDefs.entries()) {
    const id = await ensureUser(r.email);
    await admin.from("profiles").upsert({
      id,
      is_recruiter: true,
      display_name: r.displayName,
      company_name: r.companyName,
      company_industry: r.kind === "finance" ? "Financial Services" : "Technology",
      recruiter_tier: r.recruiterTier,
      invite_code: `seed-r${i}`,
    });
    await admin.from("consent_flags").upsert({ profile_id: id, tos_accepted_at: new Date().toISOString(), consent_version: CONSENT_V });
    await admin.from("points_ledger").insert({ profile_id: id, event: "seed", amount: 200, note: "staging recruiter seed" });
    recruiters.push({ ...r, id }); // staging id, so buildJobs assigns real recruiter_id
  }
  console.log(`  ${recruiters.length} recruiters seeded`);

  // --- 50 seekers (real Modal embeddings) ---
  const seekerIds: string[] = [];
  for (let i = 0; i < SEEKER_COUNT; i++) {
    const s = buildSeeker(i);
    const id = await ensureUser(s.email);
    seekerIds.push(id);
    const now = new Date().toISOString();
    const credSummary = credentialsFloorSummary(s.credentials);
    const vec = await embed(s.text); // s.text already includes the credentials recognitions line
    await admin.from("profiles").upsert({
      id,
      is_seeker: true,
      is_recruiter: s.isDualRoleRecruiter,
      company_name: s.isDualRoleRecruiter ? "Moonstone Talent (seeker-run agency)" : null,
      display_name: s.displayName,
      visibility: "active",
      headline: s.headline,
      location: s.location,
      skills: s.skills,
      industries: s.industries,
      desired_roles: s.desiredRoles,
      seniority_band: seniorityBand(s.yearsExperience),
      years_experience: s.yearsExperience,
      credentials: s.credentials || null,
      credentials_summary: credSummary || null,
      dealbreaker_matrix: { min_salary: s.minSalary, currency: "USD", work_setups: s.workSetups },
      draft_text: s.text,
      published_text: s.text,
      last_profile_activity_at: now,
      seeker_tier: s.seekerTier,
      share_salary: s.shareSalary,
      invite_code: `seed-s${i}`,
    });
    await admin.from("consent_flags").upsert({
      profile_id: id,
      reveal_override_enabled: true,
      tos_accepted_at: now,
      processing_consent_at: now,
      profiling_consent_at: now,
      consent_version: CONSENT_V,
      market_signals_opt_in_at: now, // clears k>=20 cohorts
      market_signals_consent_version: "2026-07-21-draft",
      maintenance_consent_at: s.maintenanceConsentWithdrawn ? null : now,
      maintenance_consent_version: s.maintenanceConsentWithdrawn ? null : "2026-07-28-draft",
      agent_access_opt_in_at: s.agentAccessOptIn ? now : null,
      agent_access_consent_version: s.agentAccessOptIn ? "2026-08-14-draft" : null,
      connected_accounts_opt_in_at: s.connectedAccountsOptIn ? now : null,
      connected_accounts_consent_version: s.connectedAccountsOptIn ? "2026-08-01-draft" : null,
    });
    await admin.from("skill_vectors").upsert(
      { profile_id: id, redacted_text: s.text, embedding: JSON.stringify(vec) },
      { onConflict: "profile_id" },
    );
    await admin.from("points_ledger").insert({ profile_id: id, event: "seed", amount: 10, note: "staging seeker seed" });
    if ((i + 1) % 10 === 0) console.log(`  seekers: ${i + 1}/${SEEKER_COUNT}`);
  }

  // --- 20 jobs (real Modal embeddings), assigned to the staging recruiters ---
  const jobs = buildJobs(recruiters);
  const jobIds: string[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]!;
    const vec = await embed(`${j.title}\n\n${j.description}`);
    const { data, error } = await admin
      .from("job_postings")
      .insert({
        recruiter_id: j.recruiterId,
        title: j.title,
        description: j.description,
        salary_min: j.salaryMin,
        salary_max: j.salaryMax,
        work_setups: j.workSetups,
        location: j.location,
        status: "active",
        embedding: JSON.stringify(vec),
        salary_visibility: j.salaryVisibility,
        offers_equity: j.offersEquity,
      })
      .select("id")
      .single();
    if (error) throw new Error(`job insert: ${error.message}`);
    jobIds.push(data.id);
  }
  console.log(`  ${jobIds.length} jobs seeded`);

  // --- matches via match_candidates(); ~80% interested, staggered time ---
  let totalMatches = 0;
  for (let i = 0; i < jobIds.length; i++) {
    const jobId = jobIds[i]!;
    const { data: cands, error } = await admin.rpc("match_candidates", { p_job_id: jobId, p_threshold: 0.55, p_top_n: 40 });
    if (error) throw new Error(`match_candidates: ${error.message}`);
    const interested = i % 5 !== 4;
    const rows = ((cands ?? []) as { profile_id: string; score: number }[]).map((c) => ({
      job_posting_id: jobId,
      profile_id: c.profile_id,
      score: c.score,
      status: interested ? "interested" : "surfaced",
      interested_at: interested ? new Date(Date.now() - (i % 14) * 86_400_000).toISOString() : null,
    }));
    if (!rows.length) continue;
    await admin.from("matches").upsert(rows, { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true });
    totalMatches += rows.length;
  }
  console.log(`  ${totalMatches} matches`);

  // ==========================================================================
  // Deterministic/structural additions that need live ids (not AI, but need
  // real DB round-trips — training_programs ids, agent token hashing, etc).
  // ==========================================================================

  // --- seeker_experience (0008) --------------------------------------------
  const seekers50 = Array.from({ length: SEEKER_COUNT }, (_, i) => buildSeeker(i));
  const experienceRows = buildSeekerExperience(seekers50);
  for (const e of experienceRows) {
    const startDate = new Date(Date.now() - e.startMonthsAgo * 30 * 86_400_000).toISOString().slice(0, 10);
    const endDate = e.endMonthsAgo === null ? null : new Date(Date.now() - e.endMonthsAgo * 30 * 86_400_000).toISOString().slice(0, 10);
    await admin.from("seeker_experience").insert({
      profile_id: seekerIds[e.seekerIdx]!,
      role: e.role,
      company: e.company,
      industry: e.industry,
      start_date: startDate,
      end_date: endDate,
    });
  }
  console.log(`  ${experienceRows.length} seeker_experience rows`);

  // --- referrals (0029) + paired points_ledger reward rows -----------------
  // Direct-inserted final-state rows (not a live earnReferralActivation call)
  // — that function always writes now() and has no way to backdate, but the
  // daily-cap demo row specifically needs a controllable, NOT-today
  // created_at so a seeded referrer doesn't start already at-cap for e2e
  // specs run days later (same reasoning as the reveal/override backdating
  // below). Kept in lockstep with src/lib/points.ts's REFERRAL_REWARD_POINTS/
  // REFERRAL_DAILY_CAP via the constants re-declared in generate-smoke-seed.ts.
  const referralPlan = buildReferralPlan();
  for (const row of referralPlan) {
    const createdAt = new Date(Date.now() - row.daysAgo * 86_400_000).toISOString();
    const { error } = await admin.from("referrals").insert({
      referrer_id: seekerIds[row.referrerIdx]!,
      referee_id: seekerIds[row.refereeIdx]!,
      invite_code: `seed-s${row.referrerIdx}`,
      status: row.status,
      created_at: createdAt,
      activated_at: row.status === "activated" ? createdAt : null,
    });
    if (error) throw new Error(`referral insert: ${error.message}`);
    if (row.status === "activated") {
      await admin.from("points_ledger").insert([
        { profile_id: seekerIds[row.referrerIdx]!, event: "verified_action", amount: 5, note: "referral activation reward (referrer)", created_at: createdAt },
        { profile_id: seekerIds[row.refereeIdx]!, event: "verified_action", amount: 5, note: "referral activation reward (referee)", created_at: createdAt },
      ]);
    }
  }
  console.log(`  ${referralPlan.length} referrals seeded (incl. one at-daily-cap case)`);

  // --- agent_tokens / agent_access_log (0031) -------------------------------
  const agentTokenPlan = buildAgentTokenPlan();
  for (const [i, t] of agentTokenPlan.entries()) {
    const { data: tokenRow, error } = await admin
      .from("agent_tokens")
      .insert({
        profile_id: seekerIds[t.seekerIdx]!,
        token_hash: hashAgentToken(`seed-agent-token-${i}`),
        label: t.label,
        revoked_at: t.revoked ? new Date(Date.now() - 2 * 86_400_000).toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`agent_tokens insert: ${error.message}`);
    for (const tool of t.toolCalls) {
      await admin.from("agent_access_log").insert({ profile_id: seekerIds[t.seekerIdx]!, agent_token_id: tokenRow.id, tool });
    }
  }
  console.log(`  ${agentTokenPlan.length} agent tokens seeded`);

  // --- connected_accounts (0026) --------------------------------------------
  const connectedPlan = buildConnectedAccountPlan();
  for (const c of connectedPlan) {
    await admin.from("connected_accounts").upsert(
      {
        profile_id: seekerIds[c.seekerIdx]!,
        provider: "google_drive",
        access_token: "seed-placeholder-access-token",
        refresh_token: "seed-placeholder-refresh-token",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        scope: "drive.readonly",
      },
      { onConflict: "profile_id,provider" },
    );
  }
  console.log(`  ${connectedPlan.length} connected accounts seeded`);

  // --- key custody (0030): real recovery-code-derived DEK chain ------------
  const keyCustodySeekerIdxs = [3, 9];
  for (const idx of keyCustodySeekerIdxs) {
    const plan = await buildKeyCustody(idx);
    const profileId = seekerIds[idx]!;
    await admin.from("user_data_keys").upsert({ profile_id: profileId, wrapped_dek: plan.wrappedDekPrimary, credential_id: plan.primaryCredentialId });
    await admin.from("user_data_key_recovery").delete().eq("profile_id", profileId);
    await admin.from("user_data_key_recovery").insert(
      plan.recoveryCodes.map((c) => ({ profile_id: profileId, code_hash: c.codeHash, wrapped_dek: c.wrappedDek, salt: c.salt })),
    );
    await admin.from("resumes").insert({
      profile_id: profileId,
      storage_path: null,
      raw_text: plan.encryptedRawTextB64,
      encrypted: true,
      enc_algo: "aes-256-gcm-v1",
    });
  }
  console.log(`  ${keyCustodySeekerIdxs.length} key-custody chains seeded (real, recovery-code-derived)`);

  // --- training/benefits (0010/0011): existing catalog, profile-linked rows -
  // training_programs/benefit_partners are seeded once by their OWN
  // migrations (0010/0011 insert catalog rows directly) — never re-inserted
  // here. Only look up their real ids and write the profile-linked tables.
  const { data: programs, error: programsError } = await admin.from("training_programs").select("id, title, track, credit_cost");
  if (programsError) throw new Error(`training_programs lookup: ${programsError.message}`);
  const programByTitle = new Map((programs ?? []).map((p) => [p.title, p]));
  const systemDesign = programByTitle.get("System Design Fundamentals");
  const pathToStaff = programByTitle.get("Path to Staff Backend Engineer");
  const securityAwareness = programByTitle.get("Security Awareness");
  const amlFundamentals = programByTitle.get("AML Fundamentals");
  if (!systemDesign || !pathToStaff || !securityAwareness || !amlFundamentals) {
    throw new Error("expected training_programs catalog rows not found — has migration 0010 been applied?");
  }
  // Seeker #4 (pro tier, i%4===0): completes a program for real via the same
  // spendTrainingCredits/rewardTrainingCompletion helpers the app uses. Free-
  // tier completion is a documented, unresolved bootstrap gap in the real app
  // itself (src/lib/training.ts's own doc comment: free users need credits to
  // start a program but only earn credits by completing one) — not something
  // this seed script should paper over with a nonexistent credit-grant path.
  const proSeekerIdx = 4;
  await admin.from("training_completions").insert({ profile_id: seekerIds[proSeekerIdx]!, program_id: systemDesign.id });
  await spendTrainingCredits(admin, seekerIds[proSeekerIdx]!, systemDesign.id, costForSeeker(systemDesign.credit_cost, "pro"));
  await rewardTrainingCompletion(admin, seekerIds[proSeekerIdx]!, systemDesign.id, systemDesign.title, "pro");
  await admin.from("profiles").update({ career_path_program_id: pathToStaff.id }).eq("id", seekerIds[proSeekerIdx]!);
  // Enterprise assignments (no credits involved) — one pending, one completed.
  await admin.from("enterprise_training_assignments").insert([
    { recruiter_id: recruiters[0]!.id, profile_id: seekerIds[5]!, program_id: securityAwareness.id, completed_at: null },
    { recruiter_id: recruiters[0]!.id, profile_id: seekerIds[13]!, program_id: amlFundamentals.id, completed_at: new Date().toISOString() },
  ]);
  console.log("  training/benefits: 1 real completion (pro), 2 enterprise assignments (1 pending, 1 completed)");

  // ==========================================================================
  // Live/AI pass — real Modal generation + real grading + real web-search
  // company research. Abort-and-revert on any failure here (see
  // revertAiPassContent): never deletes append-only tables (points_ledger,
  // pii_access_log, company_research_requests, verified_actions).
  // ==========================================================================
  const ai = getAiProvider();

  // --- screening questions (0034) -------------------------------------------
  // Jobs 0,1: published (candidate-visible). Jobs 2,3: enabled but left in
  // draft (never candidate-visible — same invariant screening-questions.spec.ts
  // asserts). Job 0 also gets a 'required' preference on its first question,
  // paired with one candidate answer that FAILS it — a real, reachable
  // dealbreaker case, not just the happy path.
  const screeningJobIdxs = [0, 1, 2, 3];
  for (const i of screeningJobIdxs) {
    const jobId = jobIds[i]!;
    const j = jobs[i]!;
    const drafts = await ai.generateScreeningQuestions(assertJDTextOnly(`${j.title}\n\n${j.description}`));
    const questions = drafts.map((d) => ({ id: randomUUID(), question: d.question, rubric: d.rubric }));
    const published = i < 2;
    revertTracking.jobIdsWithScreening.add(jobId);
    await admin
      .from("job_postings")
      .update({
        screening_enabled: true,
        screening_questions: questions,
        screening_status: published ? "published" : "draft",
        screening_prefs: i === 0 && questions[0] ? { [questions[0].id]: "required" } : {},
      })
      .eq("id", jobId);
    if (!published || !questions.length) continue;

    // Record a couple of candidate answers against this published job —
    // reuses the exact grading call submitScreeningAnswer uses
    // (gradeAssessmentAttempt against the question's own rubric).
    const { data: matchedRows } = await admin.from("matches").select("profile_id").eq("job_posting_id", jobId).limit(3);
    for (const [ci, m] of (matchedRows ?? []).entries()) {
      const q = questions[ci % questions.length]!;
      // First candidate against job 0's required question deliberately
      // answers weakly — the dealbreaker-fail case described above.
      const answerText =
        i === 0 && ci === 0 && q.id === questions[0]!.id
          ? "Not sure, haven't done this before."
          : "I have direct hands-on experience delivering exactly this, including production incidents I resolved.";
      const grade = await ai.gradeAssessmentAttempt(q.rubric, answerText);
      await admin.from("candidate_screening_answers").insert({
        job_posting_id: jobId,
        profile_id: m.profile_id,
        question_id: q.id,
        answer_text: answerText,
        passed: grade.passed,
        rationale: grade.rationale,
      });
    }
  }
  console.log(`  screening questions: ${screeningJobIdxs.length} jobs (2 published, 2 draft), sample answers incl. one dealbreaker fail`);

  // --- skill assessments (0033) ---------------------------------------------
  const ASSESSMENT_DEFS = [
    { skill: "Go", prompt: "Explain how you'd design a rate limiter for a high-throughput Go service.", rubric: "Passes if the answer covers a token-bucket or sliding-window approach and concurrency safety." },
    { skill: "Python", prompt: "Describe how you'd profile and optimize a slow Python data pipeline.", rubric: "Passes if the answer mentions profiling tools (cProfile/py-spy) and at least one concrete optimization." },
    { skill: "Financial Modeling", prompt: "Walk through building a 3-statement financial model from scratch.", rubric: "Passes if the answer links income statement, balance sheet, and cash flow with correct causality." },
  ];
  const assessmentBySkill = new Map<string, string>();
  for (const def of ASSESSMENT_DEFS) {
    const { data, error } = await admin
      .from("skill_assessments")
      .insert({ skill: def.skill, prompt: def.prompt, rubric: def.rubric, status: "published", created_by: recruiters[0]!.id })
      .select("id")
      .single();
    if (error) throw new Error(`skill_assessments insert: ${error.message}`);
    revertTracking.skillAssessmentIds.add(data.id);
    assessmentBySkill.set(def.skill, data.id);
  }
  // Two attempts per assessment: one strong (should pass, earns real points +
  // a verified_actions row via the real earnSkillAssessmentPass), one weak
  // (should fail, no points).
  let assessmentIdx = 0;
  for (const [skill, assessmentId] of assessmentBySkill) {
    const def = ASSESSMENT_DEFS.find((d) => d.skill === skill)!;
    const attemptSeekers: Array<{ profileIdx: number; answerText: string }> = [
      { profileIdx: 20 + assessmentIdx * 2, answerText: `Detailed, specific approach: ${def.prompt} — I've done this in production, including edge cases and trade-offs.` },
      { profileIdx: 21 + assessmentIdx * 2, answerText: "I don't really know." },
    ];
    for (const { profileIdx, answerText } of attemptSeekers) {
      const grade = await ai.gradeAssessmentAttempt(def.rubric, answerText);
      const { data: attempt, error } = await admin
        .from("assessment_attempts")
        .insert({
          assessment_id: assessmentId,
          profile_id: seekerIds[profileIdx]!,
          answer_text: answerText,
          passed: grade.passed,
          rationale: grade.rationale,
        })
        .select("id")
        .single();
      if (error) throw new Error(`assessment_attempts insert: ${error.message}`);
      revertTracking.assessmentAttemptIds.add(attempt.id);
      if (grade.passed) await earnSkillAssessmentPass(admin, seekerIds[profileIdx]!, assessmentId, skill);
    }
    assessmentIdx++;
  }
  // verified_skill_prefs on two jobs, referencing the published skills.
  await admin.from("job_postings").update({ verified_skill_prefs: { Go: "required" } }).eq("id", jobIds[0]!);
  await admin.from("job_postings").update({ verified_skill_prefs: { Python: "weighted" } }).eq("id", jobIds[2]!);
  console.log(`  skill assessments: ${ASSESSMENT_DEFS.length} published, ${SKILL_ASSESSMENT_PASS_POINTS}pt real grading pass/fail pairs`);

  // --- company research (0035) ----------------------------------------------
  // One representative job per company (first job assigned to each
  // recruiter), real Modal + web-search generation, plus a request-log row
  // simulating one seeker's lookup (rate-limit path).
  // Checked here, not at module load, so a --no-wipe reseed or any run that
  // doesn't reach this section doesn't need this key at all.
  if (!env.WEB_SEARCH_API_KEY) throw new Error("missing WEB_SEARCH_API_KEY — needed for real company-research generation");
  const companyResearchJobs = new Map<string, string>(); // recruiterId -> first jobId
  jobs.forEach((j, i) => {
    if (!companyResearchJobs.has(j.recruiterId)) companyResearchJobs.set(j.recruiterId, jobIds[i]!);
  });
  let researchCount = 0;
  for (const r of recruiters) {
    const jobId = companyResearchJobs.get(r.id);
    if (!jobId) continue;
    const summary = await ai.researchCompany(assertCompanyIdentifier(r.companyName));
    revertTracking.companyResearchCacheJobIds.add(jobId);
    await admin.from("company_research_cache").insert({ job_posting_id: jobId, summary });
    const { data: matched } = await admin.from("matches").select("profile_id").eq("job_posting_id", jobId).limit(1).maybeSingle();
    if (matched) {
      await admin.from("company_research_requests").insert({ profile_id: matched.profile_id, job_posting_id: jobId });
    }
    researchCount++;
  }
  console.log(`  company research: ${researchCount} companies (real Modal + web search)`);

  // ==========================================================================
  // Reveal -> messaging -> interview chain. Direct-inserted (not via the
  // "use server" revealCandidate/overrideRevealCandidate actions, which
  // require a Next.js request/cookie session — not callable from a plain
  // script) but reusing the REAL appendLedger/logPiiAccess helpers and
  // mirroring performReveal's exact shape (src/app/(app)/recruiter/actions.ts).
  // Reveal/override timestamps are explicitly backdated so a seeded
  // recruiter/candidate never starts already at REVEAL_DAILY_CAP/
  // OVERRIDE_DAILY_CAP/the 30-day re-override window for e2e specs run days
  // later — appendLedger itself always writes now(), so the points_ledger
  // rows for THIS section are inserted directly (not via appendLedger) so
  // their created_at can be backdated to match; the daily-cap counters
  // (src/lib/points.ts's countStandardRevealsToday/countOverridesToday)
  // filter on points_ledger.created_at, so this is load-bearing, not cosmetic.
  // ==========================================================================
  async function seedReveal(input: {
    matchId: string; jobId: string; profileId: string; recruiterId: string; jobTitle: string; jobDescription: string;
    path: "standard" | "override"; cost: number; compensation: number; daysAgo: number;
    revealStatus: "accepted" | "pending" | "declined"; premiumRefund?: number; declineDaysAgo?: number;
  }): Promise<void> {
    const createdAt = new Date(Date.now() - input.daysAgo * 86_400_000).toISOString();
    const { data: vector } = await admin.from("skill_vectors").select("redacted_text").eq("profile_id", input.profileId).single();
    const fitSummary = await ai.fitSummary(vector?.redacted_text ?? "", `${input.jobTitle}\n\n${input.jobDescription}`);
    const { data: reveal, error } = await admin
      .from("reveal_requests")
      .insert({
        match_id: input.matchId, job_posting_id: input.jobId, profile_id: input.profileId, recruiter_id: input.recruiterId,
        path: input.path, status: input.revealStatus, fit_summary: fitSummary, premium_refund: input.premiumRefund ?? null,
        created_at: createdAt,
        responded_at: input.revealStatus !== "pending" ? new Date(Date.now() - (input.declineDaysAgo ?? input.daysAgo) * 86_400_000).toISOString() : null,
        refunded: input.revealStatus === "declined",
      })
      .select("id")
      .single();
    if (error) throw new Error(`reveal_requests insert: ${error.message}`);

    await admin.from("points_ledger").insert([
      {
        profile_id: input.recruiterId,
        event: input.path === "standard" ? "reveal_spend" : "override_spend",
        amount: -input.cost,
        reveal_request_id: reveal.id,
        note: `seed ${input.path} reveal`,
        created_at: createdAt,
      },
      {
        profile_id: input.profileId,
        event: "reveal_compensation",
        amount: input.compensation,
        reveal_request_id: reveal.id,
        note: `seed ${input.path} reveal compensation`,
        created_at: createdAt,
      },
    ]);
    if (input.revealStatus === "declined" && input.premiumRefund) {
      await admin.from("points_ledger").insert({
        profile_id: input.recruiterId,
        event: "partial_refund",
        amount: input.premiumRefund,
        reveal_request_id: reveal.id,
        note: "override declined by candidate",
        created_at: new Date(Date.now() - (input.declineDaysAgo ?? input.daysAgo) * 86_400_000).toISOString(),
      });
    }
    await admin.from("matches").update({ status: "revealed" }).eq("id", input.matchId);
    await admin.from("message_threads").insert({ reveal_request_id: reveal.id });
    await logPiiAccess(admin, {
      accessorId: input.recruiterId, accessorRole: "recruiter", subjectId: input.profileId,
      resource: "candidate_identity", action: input.path === "standard" ? "standard_reveal" : "override_reveal",
    });
  }

  // Standard reveal: needs an 'interested' match. Job 5's first interested candidate.
  const standardJobIdx = 5;
  const { data: interestedMatch } = await admin
    .from("matches").select("id, profile_id").eq("job_posting_id", jobIds[standardJobIdx]!).eq("status", "interested").limit(1).maybeSingle();
  if (interestedMatch) {
    await seedReveal({
      matchId: interestedMatch.id, jobId: jobIds[standardJobIdx]!, profileId: interestedMatch.profile_id, recruiterId: jobs[standardJobIdx]!.recruiterId,
      jobTitle: jobs[standardJobIdx]!.title, jobDescription: jobs[standardJobIdx]!.description,
      path: "standard", cost: REVEAL_COST, compensation: REVEAL_COMPENSATION, daysAgo: 10, revealStatus: "accepted",
    });
  }
  // Override reveals: needs 'surfaced' matches. Job 4 (index 4, one of the
  // "not interested" jobs, i%5===4) has surfaced-only candidates.
  const overrideJobIdx = 4;
  const { data: surfacedMatches } = await admin
    .from("matches").select("id, profile_id").eq("job_posting_id", jobIds[overrideJobIdx]!).eq("status", "surfaced").limit(3);
  const overrideStates: Array<{ status: "accepted" | "pending" | "declined"; daysAgo: number; declineDaysAgo?: number }> = [
    { status: "accepted", daysAgo: 15 },
    { status: "pending", daysAgo: 3 },
    { status: "declined", daysAgo: 40, declineDaysAgo: 40 }, // expired block (>30 days) — isOverrideBlocked should read false
  ];
  for (const [i, m] of (surfacedMatches ?? []).entries()) {
    const state = overrideStates[i];
    if (!state) break;
    await seedReveal({
      matchId: m.id, jobId: jobIds[overrideJobIdx]!, profileId: m.profile_id, recruiterId: jobs[overrideJobIdx]!.recruiterId,
      jobTitle: jobs[overrideJobIdx]!.title, jobDescription: jobs[overrideJobIdx]!.description,
      path: "override", cost: OVERRIDE_COST, compensation: OVERRIDE_COMPENSATION, daysAgo: state.daysAgo, revealStatus: state.status,
      premiumRefund: state.status === "declined" ? OVERRIDE_PREMIUM_REFUND : undefined, declineDaysAgo: state.declineDaysAgo,
    });
  }
  console.log("  reveal chain: 1 standard (accepted), overrides (accepted/pending/declined-expired)");

  console.log("\nDone. Logins (password J0B!Demo#2026$secure):");
  console.log("  recruiters: nimbus@smoke.local, harbour@smoke.local, sterling@smoke.local, …");
  console.log("  seekers:    backend1@smoke.local, quant11@smoke.local, …");
  console.log("Market-intel cohorts (opted-in) should clear k>=20.");
}

// --- --verify: count rows in every newly-seeded table, fail loud on zero ---
// REQUIRED tables are populated unconditionally by this script (no
// dependency on match_candidates returning rows for a specific job, or on
// real AI grading landing on a particular pass/fail outcome) — a zero here
// means an insert silently no-opped (missing grant, RLS, wrong FK order).
// BEST_EFFORT tables genuinely can end up empty on a legitimate run (e.g.
// job #4/#5 happen to get zero real-embedding matches at the 0.55
// threshold, or Modal's real grading marks every "strong" answer a fail) —
// logged, not fatal, so --verify doesn't cry wolf on real variance.
const REQUIRED_VERIFY_TABLES = [
  "seeker_experience", "referrals", "agent_tokens", "agent_access_log", "connected_accounts",
  "user_data_keys", "user_data_key_recovery", "skill_assessments", "assessment_attempts",
  "company_research_cache", "training_completions", "enterprise_training_assignments",
] as const;
const BEST_EFFORT_VERIFY_TABLES = [
  "candidate_screening_answers", "company_research_requests", "reveal_requests",
  "message_threads", "pii_access_log", "verified_actions",
] as const;

async function countTable(table: string): Promise<number> {
  // select("*", ...) not select("id", ...) — company_research_cache's PK is
  // job_posting_id and user_data_keys' PK is profile_id, neither has an
  // `id` column, so selecting "id" would error rather than count.
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`--verify count failed for ${table}: ${error.message}`);
  return count ?? 0;
}

async function verify(): Promise<void> {
  console.log("\n--verify: counting rows per newly-seeded table…");
  let anyZero = false;
  for (const table of REQUIRED_VERIFY_TABLES) {
    const count = await countTable(table);
    console.log(`  ${table}: ${count}`);
    if (!count) anyZero = true;
  }
  for (const table of BEST_EFFORT_VERIFY_TABLES) {
    const count = await countTable(table);
    console.log(`  ${table}: ${count}${count ? "" : " (best-effort — depends on real match/AI-grading outcome, not necessarily a bug)"}`);
  }
  if (anyZero) throw new Error("--verify: one or more REQUIRED tables have zero rows — a table's insert silently no-opped (check grants/RLS/FK order)");
  console.log("--verify: all required tables non-zero.");
}

main()
  .then(async () => {
    if (VERIFY) await verify();
  })
  .catch(async (e) => {
    await revertAiPassContent().catch((revertError) => console.error("revert also failed:", revertError));
    console.error(e);
    process.exit(1);
  });
