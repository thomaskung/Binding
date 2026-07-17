/**
 * Rich demo seed — run AFTER `pnpm db:reset`, with local Supabase up:
 *
 *   pnpm seed:demo
 *
 * Creates a busy marketplace so both sides demo instantly:
 *  - 12 extra seekers with published, embedded profiles (stub embeddings —
 *    the same implementation the app uses, so scores are consistent)
 *  - 3 active jobs owned by the demo recruiter
 *  - matches computed via the real match_candidates RPC; ~60% pre-marked
 *    "interested" so the recruiter can reveal immediately
 *  - the demo seeker gets a real vector too, so they see all matching jobs
 *  - recruiter topped up with extra points for a reveal spree
 *
 * Local-dev only. Reads keys from .env.local.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { stubProvider } from "../src/lib/ai/stub";

// --- env ---------------------------------------------------------------
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && m[1] && m[2] !== undefined) env[m[1]] = m[2];
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("missing Supabase keys in .env.local");
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const DEMO_PASSWORD = "J0B!Demo#2026$secure";
const RECRUITER_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_SEEKER_ID = "00000000-0000-0000-0000-000000000001";

// --- data ---------------------------------------------------------------
// Profile texts deliberately share vocabulary with the JDs below — the stub
// embedding is a token-hash bag, so overlap == high cosine score.

const JOBS = [
  {
    title: "Backend Engineer, Payments",
    description:
      "Backend engineer for our payments platform: distributed systems, Postgres, Kubernetes, event-driven pipelines, microservices in Go. You will own core payment rails, ledger correctness and settlement infrastructure at scale.",
    salary_min: 100000,
    salary_max: 160000,
    work_setups: ["remote", "hybrid"],
  },
  {
    title: "Senior Data Engineer",
    description:
      "Senior data engineer: batch and streaming data pipelines with Spark, Kafka, Airflow. Python and SQL, warehouse modeling, data quality and orchestration for analytics and machine learning platforms.",
    salary_min: 90000,
    salary_max: 150000,
    work_setups: ["remote", "onsite"],
  },
  {
    title: "Frontend Engineer, Web Platform",
    description:
      "Frontend engineer for our web platform: React, TypeScript, Next.js, design systems, performance and accessibility. Build polished product interfaces and component libraries with strong UX collaboration.",
    salary_min: 85000,
    salary_max: 140000,
    work_setups: ["remote", "hybrid"],
  },
  // Two more backend-adjacent roles so backend-profile seekers (including the
  // demo seeker) see several matches at once, not just one.
  {
    title: "Platform Engineer, Distributed Systems",
    description:
      "Platform engineer: distributed systems, Kubernetes, Postgres, event-driven microservices, infrastructure for engineering teams. Own reliability and scale of the core platform.",
    salary_min: 95000,
    salary_max: 155000,
    work_setups: ["remote", "hybrid"],
  },
  {
    title: "Senior Software Engineer, Ledger & Settlement",
    description:
      "Senior software engineer for ledger and settlement systems: payments, distributed systems, Postgres, event-driven pipelines, correctness at scale, backend services in Go on Kubernetes.",
    salary_min: 110000,
    salary_max: 170000,
    work_setups: ["remote"],
  },
];

const SEEKERS: { name: string; text: string; minSalary: number; setups: string[] }[] = [
  // backend cluster
  { name: "Alex Wong", text: "Backend engineer, distributed systems and payments: Postgres, Kubernetes, event-driven pipelines, microservices in Go. Built payment rails and ledger systems for a payments platform at scale.", minSalary: 110000, setups: ["remote", "hybrid"] },
  { name: "Priya Nair", text: "Senior backend engineer: microservices, Postgres, Kubernetes, distributed systems, event-driven architecture. Payments platform experience — settlement infrastructure, ledger correctness, Go services.", minSalary: 120000, setups: ["remote"] },
  { name: "Marcus Lim", text: "Backend platform engineer. Distributed systems, event-driven pipelines, Postgres tuning, Kubernetes operators, Go microservices. Shipped core payment rails and settlement systems.", minSalary: 100000, setups: ["hybrid", "onsite"] },
  { name: "Sofia Chen", text: "Staff backend engineer: payments infrastructure, distributed systems, Postgres, Kafka, Kubernetes, microservices. Led ledger and settlement platform teams.", minSalary: 140000, setups: ["remote"] },
  // data cluster
  { name: "Daniel Ho", text: "Data engineer: batch and streaming pipelines with Spark, Kafka, Airflow. Python, SQL, warehouse modeling, data quality, orchestration for analytics platforms.", minSalary: 95000, setups: ["remote", "onsite"] },
  { name: "Grace Tan", text: "Senior data engineer building streaming data pipelines: Kafka, Spark, Airflow orchestration, Python and SQL, warehouse modeling and data quality for machine learning platforms.", minSalary: 105000, setups: ["remote"] },
  { name: "Rohan Mehta", text: "Data platform engineer. Spark, Airflow, Kafka streaming, Python, SQL, analytics warehouse modeling, orchestration and data quality tooling.", minSalary: 90000, setups: ["onsite", "hybrid"] },
  { name: "Yuki Tanaka", text: "Analytics engineer turned data engineer: SQL, Python, Spark pipelines, Airflow, warehouse modeling, streaming with Kafka, data quality frameworks.", minSalary: 88000, setups: ["remote", "hybrid"] },
  // frontend cluster
  { name: "Emma Lau", text: "Frontend engineer: React, TypeScript, Next.js, design systems, performance and accessibility. Built product interfaces and component libraries for a web platform.", minSalary: 90000, setups: ["remote", "hybrid"] },
  { name: "Nathan Koh", text: "Senior frontend engineer. React, TypeScript, Next.js, web platform performance, accessibility, design systems and component libraries with strong UX collaboration.", minSalary: 100000, setups: ["remote"] },
  { name: "Isabelle Ng", text: "Frontend product engineer: TypeScript, React, Next.js, design systems, accessibility, performance optimization, polished product interfaces.", minSalary: 85000, setups: ["hybrid"] },
  { name: "Leo Martins", text: "Web platform engineer: React, Next.js, TypeScript, component libraries, design systems, performance, accessibility and product interface polish.", minSalary: 95000, setups: ["remote", "onsite"] },
];

// --- helpers ------------------------------------------------------------
async function ensureSeekerUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (data.user) return data.user.id;
  if (error?.code === "email_exists") {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list.users.find((u) => u.email === email);
    if (existing) return existing.id;
  }
  throw new Error(`createUser(${email}) failed: ${error?.message}`);
}

async function publishSeeker(userId: string, s: (typeof SEEKERS)[number]) {
  const { redactedText } = await stubProvider.redact(s.text);
  const embedding = await stubProvider.embed(redactedText);

  await admin.from("profiles").upsert({
    id: userId,
    role: "seeker",
    display_name: s.name,
    visibility: "active",
    dealbreaker_matrix: { min_salary: s.minSalary, currency: "USD", work_setups: s.setups },
    draft_text: s.text,
    published_text: s.text,
  });
  await admin.from("consent_flags").upsert({ profile_id: userId, reveal_override_enabled: true });
  await admin.from("skill_vectors").upsert(
    { profile_id: userId, redacted_text: redactedText, embedding: JSON.stringify(embedding) },
    { onConflict: "profile_id" },
  );
  const { data: seeded } = await admin
    .from("points_ledger")
    .select("id")
    .eq("profile_id", userId)
    .eq("event", "seed")
    .maybeSingle();
  if (!seeded) {
    await admin.from("points_ledger").insert({ profile_id: userId, event: "seed", amount: 10, note: "signup seed" });
  }
}

// --- main ---------------------------------------------------------------
async function main() {
  console.log("Seeding demo marketplace…");

  // 1. extra seekers
  for (let i = 0; i < SEEKERS.length; i++) {
    const seeker = SEEKERS[i]!;
    const email = `seeker${i + 1}@demo.local`;
    const userId = await ensureSeekerUser(email);
    await publishSeeker(userId, seeker);
    console.log(`  seeker ${email} (${seeker.name})`);
  }

  // 2. demo seeker gets a real stub vector (seed.sql leaves a placeholder)
  const demoText =
    "Senior backend engineer, 8 years: distributed systems, payments platform, Postgres, event-driven pipelines, microservices in Go, Kubernetes. Built payment rails, ledger and settlement systems at scale. Led platform infrastructure and reliability for core services serving 2M users.";
  await publishSeeker(DEMO_SEEKER_ID, {
    name: "Demo Seeker",
    text: demoText,
    minSalary: 90000,
    setups: ["remote", "hybrid"],
  });
  console.log("  demo seeker vector refreshed");

  // 3. jobs (idempotent by title for the demo recruiter)
  const jobIds: string[] = [];
  for (const job of JOBS) {
    const embedding = await stubProvider.embed(`${job.title}\n\n${job.description}`);
    const { data: existing } = await admin
      .from("job_postings")
      .select("id")
      .eq("recruiter_id", RECRUITER_ID)
      .eq("title", job.title)
      .maybeSingle();
    if (existing) {
      await admin
        .from("job_postings")
        .update({ ...job, status: "active", embedding: JSON.stringify(embedding) })
        .eq("id", existing.id);
      jobIds.push(existing.id);
    } else {
      const { data, error } = await admin
        .from("job_postings")
        .insert({ ...job, recruiter_id: RECRUITER_ID, status: "active", embedding: JSON.stringify(embedding) })
        .select("id")
        .single();
      if (error) throw new Error(`job insert failed: ${error.message}`);
      jobIds.push(data.id);
    }
    console.log(`  job "${job.title}"`);
  }

  // 4. matches via the real RPC, then mark ~60% interested (demo seeker's stay surfaced)
  let totalMatches = 0;
  for (const jobId of jobIds) {
    const { data: candidates, error } = await admin.rpc("match_candidates", {
      p_job_id: jobId,
      p_threshold: 0.55,
      p_top_n: 20,
    });
    if (error) throw new Error(`match_candidates failed: ${error.message}`);
    const rows = ((candidates ?? []) as { profile_id: string; score: number }[]).map((c) => ({
      job_posting_id: jobId,
      profile_id: c.profile_id,
      score: c.score,
    }));
    if (rows.length === 0) continue;
    await admin
      .from("matches")
      .upsert(rows, { onConflict: "job_posting_id,profile_id", ignoreDuplicates: true });
    totalMatches += rows.length;

    const interested = rows
      .filter((r, i) => r.profile_id !== DEMO_SEEKER_ID && i % 5 !== 4) // ~80% of extras opt in
      .map((r) => r.profile_id);
    if (interested.length > 0) {
      await admin
        .from("matches")
        .update({ status: "interested" })
        .eq("job_posting_id", jobId)
        .eq("status", "surfaced")
        .in("profile_id", interested);
    }
  }
  console.log(`  ${totalMatches} matches created`);

  // 5. recruiter points top-up for a reveal spree
  const { data: topup } = await admin
    .from("points_ledger")
    .select("id")
    .eq("profile_id", RECRUITER_ID)
    .eq("note", "demo top-up")
    .maybeSingle();
  if (!topup) {
    await admin
      .from("points_ledger")
      .insert({ profile_id: RECRUITER_ID, event: "seed", amount: 400, note: "demo top-up" });
    console.log("  recruiter topped up +400 pts");
  }

  console.log("Done. Sign in as recruiter@demo.local to reveal, seeker@demo.local to opt in.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
