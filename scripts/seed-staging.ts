/**
 * Seed the hosted STAGING Supabase with the comprehensive demo dataset:
 * 50 seekers + 20 jobs across 20 role families (tech + finance) + 8 companies.
 *
 *   pnpm tsx scripts/seed-staging.ts            # reseed staging
 *   pnpm tsx scripts/seed-staging.ts --no-wipe  # keep existing @smoke.local users
 *
 * Unlike the tracked local smoke seed (test-data/, STUB embeddings), this uses
 * the REAL Modal embedder so match scores are consistent with the live app.
 * The dataset DEFINITION is shared with the local seed — imported straight from
 * test-data/generate-smoke-seed.ts (single source of truth, no duplication).
 *
 * Reads from .env.local: SUPABASE_SERVICE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * MODAL_API_TOKEN (+ optional MODAL_EMBED_URL override).
 *
 * Logins after seeding (demo password J0B!Demo#2026$secure): any recruiter
 * (nimbus@smoke.local, harbour@smoke.local, …) or seeker (backend1@smoke.local, …).
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { credentialsFloorSummary } from "../src/lib/credentials";
import { seniorityBand } from "../src/lib/experience";
import { buildJobs, buildSeeker, SEEKER_COUNT } from "../test-data/generate-smoke-seed";

// --- env ---------------------------------------------------------------
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SUPA_URL = env.SUPABASE_SERVICE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MODAL_TOKEN = env.MODAL_API_TOKEN;
const EMBED_URL =
  env.MODAL_EMBED_URL || "https://thomaskung--binding-embeddings-embedder-embed.modal.run";
if (!SUPA_URL || !SUPA_KEY) throw new Error("missing SUPABASE_SERVICE_URL / SERVICE_ROLE_KEY");
if (!MODAL_TOKEN) throw new Error("missing MODAL_API_TOKEN");
if (!/supabase\.co/.test(SUPA_URL)) throw new Error(`refusing: SUPABASE_SERVICE_URL is not hosted (${SUPA_URL})`);
const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const PASSWORD = "J0B!Demo#2026$secure";
const CONSENT_V = "2026-07-28-draft";
const SMOKE_DOMAIN = "@smoke.local";

type Recruiter = { id: string; email: string; displayName: string; companyName: string; kind: "tech" | "finance" };

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

async function ensureUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (data.user) return data.user.id;
  if (error?.code === "email_exists") {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const u = list.users.find((x) => x.email === email);
    if (u) return u.id;
  }
  throw new Error(`createUser(${email}): ${error?.message}`);
}

/** Delete only the seed accounts (@smoke.local) — cascades their marketplace
 * data — so re-seeding is clean without nuking unrelated staging users. */
async function wipeSmoke() {
  console.log("RESET: deleting @smoke.local users (cascades their data)…");
  let total = 0;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    const smoke = data.users.filter((u) => u.email?.endsWith(SMOKE_DOMAIN));
    if (!smoke.length) break;
    for (const u of smoke) {
      await admin.auth.admin.deleteUser(u.id);
      total++;
    }
    if (data.users.length < 200) break;
  }
  console.log(`  deleted ${total} @smoke.local users`);
}

async function main() {
  // Pre-flight BEFORE the destructive wipe: confirm Modal auth + 1024-dim.
  const probe = await embed("staging seed preflight: backend engineer, go, postgres");
  console.log(`pre-flight embed OK: dim=${probe.length}`);
  if (probe.length !== 1024) throw new Error(`embed dim ${probe.length} != 1024`);

  if (!process.argv.includes("--no-wipe")) await wipeSmoke();

  // --- recruiters (8 companies, tech + finance) ---
  const recruiterDefs = JSON.parse(
    readFileSync(new URL("../test-data/smoke-recruiters.json", import.meta.url), "utf8"),
  ) as Recruiter[];
  const recruiters: Recruiter[] = [];
  for (const r of recruiterDefs) {
    const id = await ensureUser(r.email);
    await admin.from("profiles").upsert({
      id,
      is_recruiter: true,
      display_name: r.displayName,
      company_name: r.companyName,
      company_industry: r.kind === "finance" ? "Financial Services" : "Technology",
    });
    await admin.from("consent_flags").upsert({ profile_id: id, tos_accepted_at: new Date().toISOString(), consent_version: CONSENT_V });
    await admin.from("points_ledger").insert({ profile_id: id, event: "seed", amount: 200, note: "staging recruiter seed" });
    recruiters.push({ ...r, id }); // staging id, so buildJobs assigns real recruiter_id
  }
  console.log(`  ${recruiters.length} recruiters seeded`);

  // --- 50 seekers (real Modal embeddings) ---
  for (let i = 0; i < SEEKER_COUNT; i++) {
    const s = buildSeeker(i);
    const id = await ensureUser(s.email);
    const now = new Date().toISOString();
    const credSummary = credentialsFloorSummary(s.credentials);
    const vec = await embed(s.text); // s.text already includes the credentials recognitions line
    await admin.from("profiles").upsert({
      id,
      is_seeker: true,
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
  for (const j of jobs) {
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

  console.log("\nDone. Logins (password J0B!Demo#2026$secure):");
  console.log("  recruiters: nimbus@smoke.local, harbour@smoke.local, sterling@smoke.local, …");
  console.log("  seekers:    backend1@smoke.local, quant11@smoke.local, …");
  console.log("Market-intel cohorts (opted-in) should clear k>=20.");
}

main().catch((e) => { console.error(e); process.exit(1); });
