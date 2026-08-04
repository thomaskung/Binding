/**
 * Curated STAGING demo seed for the investor/CCMF walkthrough.
 *
 *   pnpm tsx scripts/seed-demo-staging.ts
 *
 * Targets the hosted staging Supabase (SUPABASE_SERVICE_URL) and embeds via
 * the live Binding Modal endpoints (real Qwen3-Embedding vectors). RESET then
 * seed clean: wipes existing auth users (cascades all marketplace data) and
 * loads a curated multi-segment pool:
 *   - hero: HK fintech backend engineer role + ~24 HK backend candidates
 *   - adjacent: SG backend (~24) so the APAC-dual + a 2nd market-intel cohort
 *   - all candidates opt into market signals → cohorts clear k>=20
 *   - demo seeker + recruiter accounts, matches (RPC), ~60% interested,
 *     recruiter top-up, a training completion + benefits-tier points history.
 *
 * Bios are written already-redacted (no names/employers), so we embed only —
 * no redact round-trip. The live redaction proof-point uses a separate resume.
 *
 * Reads creds from .env.local: SUPABASE_SERVICE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * MODAL_API_TOKEN (+ optional MODAL_EMBED_URL override).
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
if (!/supabase\.co/.test(SUPA_URL)) throw new Error(`refusing to run: SUPABASE_SERVICE_URL is not a hosted URL (${SUPA_URL})`);
const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const PASSWORD = "J0B!Demo#2026$secure";
const CONSENT_V = "2026-07-28-draft";

// --- Modal embed (direct, with warm-up + retry for cold starts) ---------
async function embed(text: string): Promise<number[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
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
    if (res.status === 401) throw new Error("Modal 401 — MODAL_API_TOKEN does not match the endpoint secret");
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error("embed failed after retries");
}

// --- curated pool -------------------------------------------------------
type Seg = { region: "Hong Kong" | "Singapore"; location: string; skills: string[]; roleWords: string };
const SEGMENTS = {
  hkBackend: {
    region: "Hong Kong",
    location: "Central, Hong Kong",
    skills: ["Go", "Postgres", "Kubernetes", "Distributed Systems", "Event-Driven Architecture"],
    roleWords: "backend engineer on payments and settlement infrastructure — distributed systems, Go microservices, Postgres, Kubernetes, event-driven pipelines, ledger correctness at scale",
  },
  sgBackend: {
    region: "Singapore",
    location: "Downtown Core, Singapore",
    skills: ["Go", "Postgres", "Kubernetes", "Microservices", "Kafka"],
    roleWords: "backend engineer for high-throughput financial services — microservices in Go, Postgres, Kubernetes, Kafka streaming, reliability and scale",
  },
} satisfies Record<string, Seg>;
const SENIORITY: { band: string; years: string; salaryMin: number }[] = [
  { band: "mid", years: "5 years", salaryMin: 90000 },
  { band: "senior", years: "8 years", salaryMin: 120000 },
  { band: "staff", years: "12 years", salaryMin: 150000 },
];
const PER_SEGMENT = 24; // > k=20

function bio(seg: Seg, sen: (typeof SENIORITY)[number]): string {
  return `${sen.years} experience as a ${seg.roleWords}. Core skills: ${seg.skills.join(", ")}. Shipped production systems for a regional financial platform; owned reliability and on-call for core services.`;
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

async function wipe() {
  console.log("RESET: deleting all staging auth users (cascades marketplace data)…");
  let total = 0;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (!data.users.length) break;
    for (const u of data.users) {
      await admin.auth.admin.deleteUser(u.id);
      total++;
    }
    if (data.users.length < 200) break;
  }
  console.log(`  deleted ${total} users`);
}

async function seedSeeker(email: string, name: string, seg: Seg, sen: (typeof SENIORITY)[number]) {
  const id = await ensureUser(email);
  const text = bio(seg, sen);
  const vec = await embed(text);
  const now = new Date().toISOString();
  await admin.from("profiles").upsert({
    id,
    is_seeker: true,
    display_name: name,
    visibility: "active",
    location: seg.location,
    skills: seg.skills,
    desired_roles: ["Backend Engineer", "Senior Software Engineer"],
    industries: ["Fintech"],
    seniority_band: sen.band,
    dealbreaker_matrix: { min_salary: sen.salaryMin, currency: "USD", work_setups: ["remote", "hybrid"] },
    draft_text: text,
    published_text: text,
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
    { profile_id: id, redacted_text: text, embedding: JSON.stringify(vec) },
    { onConflict: "profile_id" },
  );
  await admin.from("points_ledger").insert({ profile_id: id, event: "seed", amount: 10, note: "seeker activation seed" });
  return id;
}

async function main() {
  // Pre-flight BEFORE the destructive wipe: confirm Modal auth + correct dim,
  // so a broken embed can never leave staging emptied.
  const probe = await embed("hong kong fintech backend engineer, go, postgres, kubernetes");
  console.log(`pre-flight embed OK: dim=${probe.length}`);
  if (probe.length !== 1024) throw new Error(`embed dim ${probe.length} != 1024 (skill_vectors column mismatch)`);

  if (process.argv.includes("--no-wipe") === false) await wipe();

  // --- demo recruiter (hero JD owner) ---
  const recruiterId = await ensureUser("recruiter@demo.local");
  await admin.from("profiles").upsert({
    id: recruiterId,
    is_recruiter: true,
    is_seeker: true, // dual-role so the switcher is demoable
    display_name: "Rita Chan",
    company_name: "Harbour Financial Technologies",
    company_industry: "Fintech",
  });
  await admin.from("consent_flags").upsert({ profile_id: recruiterId, tos_accepted_at: new Date().toISOString(), consent_version: CONSENT_V });
  await admin.from("points_ledger").insert({ profile_id: recruiterId, event: "seed", amount: 100, note: "recruiter activation seed" });
  await admin.from("points_ledger").insert({ profile_id: recruiterId, event: "seed", amount: 500, note: "demo top-up" });

  // --- hero + adjacent JDs ---
  const JOBS = [
    { title: "Senior Backend Engineer, Payments", seg: SEGMENTS.hkBackend,
      description: "Own our HK payments ledger and settlement platform: distributed systems, Go microservices, Postgres, Kubernetes, event-driven pipelines. Ledger correctness and reliability at scale for a Hong Kong fintech.",
      salary_min: 120000, salary_max: 170000, location: "Central, Hong Kong" },
    { title: "Backend Engineer, Core Platform (SG)", seg: SEGMENTS.sgBackend,
      description: "Backend engineer for our Singapore core platform: Go, Postgres, Kubernetes, Kafka streaming, high-throughput financial services, reliability and scale.",
      salary_min: 110000, salary_max: 160000, location: "Downtown Core, Singapore" },
  ];
  const jobIds: string[] = [];
  for (const j of JOBS) {
    const vec = await embed(`${j.title}\n\n${j.description}`);
    const { data, error } = await admin.from("job_postings").insert({
      recruiter_id: recruiterId, title: j.title, description: j.description,
      salary_min: j.salary_min, salary_max: j.salary_max, work_setups: ["remote", "hybrid"],
      location: j.location, status: "active", embedding: JSON.stringify(vec),
    }).select("id").single();
    if (error) throw new Error(`job insert: ${error.message}`);
    jobIds.push(data.id);
    console.log(`  job "${j.title}"`);
  }

  // --- candidate pools ---
  const first = ["Wai", "Ka", "Mei", "Chun", "Hoi", "Sin", "Man", "Yan", "Tsz", "Lok", "Ho", "Kin", "Wing", "Ling", "Ming", "Fai", "Kwok", "Suet", "Yiu", "Chi", "Pui", "Ngai", "Hei", "Tin"];
  const last = ["Chan", "Wong", "Lee", "Cheung", "Lam", "Ng", "Ho", "Tang", "Tan", "Lim", "Koh", "Goh", "Ong", "Sim", "Teo", "Yeo", "Low", "Foo", "Chua", "Toh", "Wan", "Kwan", "Yip", "Lau"];
  let ni = 0;
  async function pool(prefix: string, seg: Seg) {
    for (let i = 0; i < PER_SEGMENT; i++) {
      const sen = SENIORITY[i % SENIORITY.length]!;
      const name = `${first[ni % first.length]} ${last[(ni * 3) % last.length]}`;
      ni++;
      await seedSeeker(`${prefix}${i + 1}@demo.local`, name, seg, sen);
      if ((i + 1) % 6 === 0) console.log(`  ${prefix}: ${i + 1}/${PER_SEGMENT}`);
    }
  }
  console.log("Seeding HK backend pool…");
  await pool("hk", SEGMENTS.hkBackend);
  console.log("Seeding SG backend pool…");
  await pool("sg", SEGMENTS.sgBackend);

  // --- demo seeker (hero candidate, HK senior backend) ---
  const demoSeekerId = await seedSeeker("seeker@demo.local", "Demo Seeker", SEGMENTS.hkBackend, SENIORITY[1]!);
  console.log("  demo seeker seeded");

  // --- matches via RPC, mark ~60% interested (demo seeker stays surfaced) ---
  let totalMatches = 0;
  for (const jobId of jobIds) {
    const { data: cands, error } = await admin.rpc("match_candidates", { p_job_id: jobId, p_threshold: 0.55, p_top_n: 40 });
    if (error) throw new Error(`match_candidates: ${error.message}`);
    const rows = ((cands ?? []) as { profile_id: string; score: number }[]).map((c) => ({ job_posting_id: jobId, profile_id: c.profile_id, score: c.score }));
    if (!rows.length) { console.log(`  job ${jobId}: 0 matches`); continue; }
    await admin.from("matches").upsert(rows, { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true });
    totalMatches += rows.length;
    const interested = rows.filter((r, i) => r.profile_id !== demoSeekerId && i % 5 !== 4).map((r) => r.profile_id);
    if (interested.length) await admin.from("matches").update({ status: "interested" }).eq("job_posting_id", jobId).eq("status", "surfaced").in("profile_id", interested);
  }
  console.log(`  ${totalMatches} matches`);

  // --- demo seeker: training completion + benefits-tier points history ---
  const { data: prog } = await admin.from("training_programs").select("id").limit(1).maybeSingle();
  if (prog) {
    await admin.from("training_completions").upsert({ profile_id: demoSeekerId, program_id: prog.id, completed_at: new Date().toISOString() }, { onConflict: "profile_id,program_id", ignoreDuplicates: true });
    await admin.from("points_ledger").insert({ profile_id: demoSeekerId, event: "verified_action", amount: 25, note: "training completion" });
    console.log("  demo seeker: training completion + points");
  } else {
    console.log("  (no training_programs on staging — /training content may need seeding separately)");
  }

  console.log("\nDone. Demo logins: recruiter@demo.local / seeker@demo.local (password J0B!Demo#2026$secure).");
  console.log("Market-intel cohorts (HK + SG backend, opted-in) should clear k>=20.");
}

main().catch((e) => { console.error(e); process.exit(1); });
