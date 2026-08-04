/**
 * Generates test-data/smoke-seed.generated.sql — a comprehensive, VARIED dev
 * dataset: 50 seekers + 20 jobs across 20 role families (10 tech, 10 finance),
 * plus 8 recruiter companies. Run `pnpm test-data:generate` after editing this
 * file or smoke-recruiters.json.
 *
 * Seekers/jobs are generated PROCEDURALLY from the role families below (not
 * hand-authored JSON) so profiles vary — distinct skill mixes, seniority,
 * years, region, credentials and text → distinct stub embeddings → varied
 * match ratios (founder observation #2). Generation is DETERMINISTIC (seeded
 * LCG, no Math.random / Date.now), so the checked-in SQL is stable across
 * regenerations. Uses the real stub embedding/redaction logic
 * (src/lib/ai/stub.ts) and the deterministic credentials floor
 * (src/lib/credentials.ts) — no model runs at seed time; the emitted file is
 * plain SQL loaded via config.toml sql_paths on `supabase db reset`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stubProvider } from "../src/lib/ai/stub";
import { credentialsFloorSummary } from "../src/lib/credentials";
import { seniorityBand } from "../src/lib/experience";

const DIR = import.meta.dirname;
const DEMO_PASSWORD = "J0B!Demo#2026$secure";
const MATCH_THRESHOLD = 0.55;
const MATCH_TOP_N = 20;
const SEEKER_SEED_POINTS = 10;
const RECRUITER_SEED_POINTS = 100;
export const SEEKER_COUNT = 50;

type Recruiter = { id: string; email: string; displayName: string; companyName: string; kind: "tech" | "finance" };

type RoleFamily = {
  key: string;
  kind: "tech" | "finance";
  titles: string[]; // [entry/mid, senior, lead] — indexed by seniority
  skills: string[]; // pool to sample from
  industries: string[];
  focus: string[]; // specializations, one picked per seeker
  achievement: string;
};

// --- 20 role families: 10 tech + 10 finance ----------------------------------
export const FAMILIES: RoleFamily[] = [
  { key: "backend", kind: "tech", titles: ["Backend Engineer", "Senior Backend Engineer", "Staff Backend Engineer"],
    skills: ["Go", "Postgres", "Kubernetes", "Distributed Systems", "Event-Driven Architecture", "gRPC", "Kafka", "Redis"],
    industries: ["Fintech", "Payments", "SaaS"], focus: ["payments & settlement", "ledger correctness", "API platforms"],
    achievement: "shipped high-throughput services owning reliability and on-call for core systems" },
  { key: "frontend", kind: "tech", titles: ["Frontend Engineer", "Senior Frontend Engineer", "Frontend Lead"],
    skills: ["React", "TypeScript", "Next.js", "Design Systems", "Accessibility", "Web Performance", "GraphQL", "Testing"],
    industries: ["SaaS", "E-commerce", "Consumer"], focus: ["design systems", "performance", "accessible UI"],
    achievement: "built polished product interfaces and reusable component libraries" },
  { key: "data", kind: "tech", titles: ["Data Engineer", "Senior Data Engineer", "Data Platform Lead"],
    skills: ["Spark", "Kafka", "Airflow", "Python", "SQL", "dbt", "Snowflake", "Data Modeling"],
    industries: ["Analytics", "Fintech", "SaaS"], focus: ["streaming pipelines", "warehouse modeling", "data quality"],
    achievement: "built batch and streaming pipelines and data-quality frameworks at scale" },
  { key: "ml", kind: "tech", titles: ["Machine Learning Engineer", "Senior ML Engineer", "ML Platform Lead"],
    skills: ["PyTorch", "LLM Fine-tuning", "MLOps", "Model Serving", "Feature Stores", "Python", "Kubernetes", "Experimentation"],
    industries: ["AI/ML", "Fintech", "SaaS"], focus: ["model serving", "LLM fine-tuning", "recommendation systems"],
    achievement: "shipped production ML systems with monitoring and experimentation platforms" },
  { key: "devops", kind: "tech", titles: ["DevOps Engineer", "Site Reliability Engineer", "SRE Lead"],
    skills: ["Kubernetes", "Terraform", "CI/CD", "Prometheus", "Grafana", "Observability", "AWS", "Incident Response"],
    industries: ["Cloud Infrastructure", "Fintech", "SaaS"], focus: ["reliability engineering", "infra automation", "observability"],
    achievement: "ran on-call and drove reliability for distributed infrastructure" },
  { key: "security", kind: "tech", titles: ["Security Engineer", "Application Security Engineer", "Security Lead"],
    skills: ["Penetration Testing", "Threat Modeling", "Secure Code Review", "SOC2", "Vulnerability Management", "Cloud Security", "IAM", "Cryptography"],
    industries: ["Cybersecurity", "Fintech"], focus: ["appsec", "cloud security", "compliance audits"],
    achievement: "led threat modeling, secure reviews and compliance audits for cloud-native platforms" },
  { key: "mobile", kind: "tech", titles: ["Mobile Engineer", "Senior Mobile Engineer", "Mobile Lead"],
    skills: ["Swift", "Kotlin", "React Native", "iOS", "Android", "CI/CD", "Offline Sync", "App Performance"],
    industries: ["Consumer Apps", "Fintech"], focus: ["offline-first sync", "app performance", "release pipelines"],
    achievement: "shipped iOS and Android apps with robust release pipelines" },
  { key: "fullstack", kind: "tech", titles: ["Full-Stack Engineer", "Senior Full-Stack Engineer", "Tech Lead"],
    skills: ["TypeScript", "Node.js", "React", "Postgres", "AWS", "GraphQL", "Docker", "System Design"],
    industries: ["SaaS", "Startups"], focus: ["end-to-end features", "product velocity", "system design"],
    achievement: "owned features end-to-end from database to UI in fast-moving teams" },
  { key: "platform", kind: "tech", titles: ["Platform Engineer", "Senior Platform Engineer", "Platform Lead"],
    skills: ["Go", "Kubernetes", "Service Mesh", "Internal Tooling", "gRPC", "CI/CD", "Terraform", "Developer Experience"],
    industries: ["Cloud Infrastructure", "Fintech"], focus: ["developer platforms", "service mesh", "internal tooling"],
    achievement: "built internal developer platforms improving deploy velocity across teams" },
  { key: "qa", kind: "tech", titles: ["QA Automation Engineer", "Senior SDET", "QA Lead"],
    skills: ["Playwright", "Selenium", "CI/CD", "Performance Testing", "Test Strategy", "TypeScript", "Load Testing", "API Testing"],
    industries: ["SaaS", "Consumer"], focus: ["test automation", "performance testing", "quality strategy"],
    achievement: "built end-to-end test automation integrated into CI pipelines" },
  // --- finance ---
  { key: "quant", kind: "finance", titles: ["Quantitative Analyst", "Senior Quant Analyst", "Head of Quant Research"],
    skills: ["Python", "C++", "Stochastic Calculus", "Derivatives Pricing", "NumPy", "Time Series", "Monte Carlo", "Statistics"],
    industries: ["Investment Banking", "Hedge Fund", "Fintech"], focus: ["derivatives pricing", "systematic strategies", "risk models"],
    achievement: "built pricing and signal models backtested across market regimes" },
  { key: "risk", kind: "finance", titles: ["Risk Analyst", "Senior Risk Manager", "Head of Market Risk"],
    skills: ["Market Risk", "Value at Risk", "Credit Risk", "Basel III", "Python", "Stress Testing", "Regulatory Capital", "SQL"],
    industries: ["Banking", "Asset Management"], focus: ["market risk", "credit risk", "stress testing"],
    achievement: "owned VaR and stress-testing frameworks meeting Basel reporting" },
  { key: "fpa", kind: "finance", titles: ["Financial Analyst", "Senior FP&A Analyst", "Finance Manager"],
    skills: ["Financial Modeling", "Forecasting", "Valuation", "Excel", "Budgeting", "Variance Analysis", "Power BI", "SQL"],
    industries: ["Corporate Finance", "SaaS", "Consumer"], focus: ["financial planning", "forecasting", "board reporting"],
    achievement: "owned the planning cycle and board-level financial reporting" },
  { key: "compliance", kind: "finance", titles: ["Compliance Analyst", "Compliance Officer", "Head of Compliance"],
    skills: ["AML/CTF", "KYC", "Regulatory Reporting", "SFC Rules", "HKMA Guidelines", "Sanctions Screening", "Policy Design", "Audit"],
    industries: ["Banking", "Fintech", "Digital Assets"], focus: ["AML/KYC programs", "regulatory reporting", "licensing"],
    achievement: "ran AML/KYC programs and regulator engagement across licenses" },
  { key: "investment", kind: "finance", titles: ["Investment Analyst", "Senior Investment Analyst", "Portfolio Manager"],
    skills: ["Equity Research", "DCF Valuation", "Portfolio Analysis", "Financial Modeling", "Bloomberg", "Fixed Income", "Macro Analysis", "Excel"],
    industries: ["Asset Management", "Hedge Fund"], focus: ["equity research", "portfolio construction", "macro strategy"],
    achievement: "produced investment theses and managed portfolio allocations" },
  { key: "trader", kind: "finance", titles: ["Trader", "Senior Trader", "Head of Trading Desk"],
    skills: ["Execution", "Market Making", "Fixed Income", "Equities", "FX", "Derivatives", "Risk Management", "Python"],
    industries: ["Investment Banking", "Hedge Fund"], focus: ["market making", "execution", "fixed income"],
    achievement: "ran a trading book managing execution and intraday risk" },
  { key: "actuary", kind: "finance", titles: ["Actuarial Analyst", "Senior Actuary", "Chief Actuary"],
    skills: ["Actuarial Modeling", "Solvency II", "IFRS 17", "R", "Reserving", "Pricing", "Mortality Models", "Statistics"],
    industries: ["Insurance", "Reinsurance"], focus: ["reserving", "pricing", "capital modeling"],
    achievement: "owned reserving and capital models under IFRS 17" },
  { key: "controller", kind: "finance", titles: ["Product Controller", "Senior Product Controller", "Head of Product Control"],
    skills: ["P&L Analysis", "Valuation Control", "Reconciliation", "Balance Sheet Substantiation", "IPV", "Excel", "SQL", "Accounting"],
    industries: ["Investment Banking", "Asset Management"], focus: ["P&L attribution", "valuation control", "reconciliation"],
    achievement: "owned daily P&L attribution and independent price verification" },
  { key: "treasury", kind: "finance", titles: ["Treasury Analyst", "Senior Treasury Manager", "Head of Treasury"],
    skills: ["Liquidity Management", "FX", "Cash Management", "Hedging", "Interest Rate Risk", "Funding", "Excel", "Bloomberg"],
    industries: ["Banking", "Corporate Finance"], focus: ["liquidity management", "FX hedging", "funding"],
    achievement: "managed liquidity, funding and FX hedging programs" },
  { key: "crypto", kind: "finance", titles: ["Crypto Analyst", "Digital Assets Analyst", "Head of Digital Assets"],
    skills: ["DeFi", "On-chain Analysis", "Smart Contracts", "Solidity", "Tokenomics", "Market Structure", "Python", "Risk"],
    industries: ["Digital Assets", "Fintech"], focus: ["on-chain analysis", "DeFi strategy", "tokenomics"],
    achievement: "produced on-chain research and digital-asset strategy for a licensed platform" },
];

const CREDS: Record<"tech" | "finance", string[]> = {
  tech: [
    "Certified Kubernetes Administrator (CKA)", "AWS Solutions Architect Professional",
    "Google Cloud Professional Architect", "1 patent in distributed systems",
    "published author on systems engineering", "CISSP", "won a company-wide hackathon",
  ],
  finance: [
    "CFA charterholder", "FRM certification", "CFA Level II candidate", "CAIA",
    "published research on market microstructure", "ACCA qualified", "won a national trading competition",
  ],
};

const HK_CITIES = ["Central, Hong Kong", "Sheung Wan, Hong Kong", "Kowloon, Hong Kong", "Wan Chai, Hong Kong", "Quarry Bay, Hong Kong"];
const SG_CITIES = ["Downtown Core, Singapore", "Tanjong Pagar, Singapore", "Raffles Place, Singapore", "Novena, Singapore", "Tiong Bahru, Singapore"];
const FIRST = ["Wai", "Mei", "Chun", "Hoi", "Yan", "Tsz", "Priya", "Daniel", "Emma", "Marcus", "Sofia", "Rohan", "Yuki", "Nathan", "Isabelle", "Leo", "Arjun", "Grace", "Kenji", "Lena", "Omar", "Chloe", "Ravi", "Nadia", "Ethan"];
const LAST = ["Chan", "Wong", "Lee", "Cheung", "Lam", "Ng", "Tan", "Lim", "Koh", "Goh", "Ong", "Sim", "Teo", "Yeo", "Kapoor", "Nakamura", "Sharma", "Rossi", "Silva", "Haddad", "Okafor", "Bauer", "Petrov", "Reyes", "Kwan"];

// Deterministic per-index PRNG (splitmix32 — well-distributed even for
// sequential/close seeds, unlike a raw LCG whose first draw clusters). No
// Math.random, so the checked-in SQL is reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sample<T>(arr: T[], n: number, r: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]!);
  return out;
}
function seniorityTitleIndex(years: number): number {
  return years >= 10 ? 2 : years >= 5 ? 1 : 0;
}

export function sqlString(s: string): string { return `'${s.replace(/'/g, "''")}'`; }
export function sqlVector(embedding: number[]): string { return `'[${embedding.join(",")}]'::vector(1024)`; }
export function sqlArray(values: string[]): string {
  return values.length ? `array[${values.map((v) => sqlString(v)).join(",")}]::text[]` : "'{}'::text[]";
}

type Seeker = {
  id: string; email: string; displayName: string; headline: string; location: string;
  yearsExperience: number; skills: string[]; industries: string[]; desiredRoles: string[];
  credentials: string; text: string; minSalary: number; workSetups: string[];
};

export function buildSeeker(i: number): Seeker {
  const fam = FAMILIES[i % FAMILIES.length]!;
  const r = rng(1000 + i * 7);
  const years = 2 + Math.floor(r() * 14); // 2–15
  const tIdx = seniorityTitleIndex(years);
  const headline = fam.titles[tIdx]!;
  const region = i % 2 === 0 ? HK_CITIES : SG_CITIES;
  const location = region[i % region.length]!;
  const skills = sample(fam.skills, 5 + Math.floor(r() * 3), r); // 5–7
  const industries = sample(fam.industries, 1 + Math.floor(r() * 2), r);
  const desiredRoles = [...new Set([headline, fam.titles[Math.min(tIdx + 1, 2)]!])];
  const focus = fam.focus[Math.floor(r() * fam.focus.length)]!;
  const nCreds = Math.floor(r() * 3.2); // 0–3, skewed low
  const credentials = sample(CREDS[fam.kind], nCreds, r).join("; ");
  const credSummary = credentialsFloorSummary(credentials);
  const base = fam.kind === "finance" ? 85000 : 90000;
  const minSalary = base + years * 6000 + Math.floor(r() * 12000);
  const name = `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const text =
    `${years} years as a ${headline.toLowerCase()}, focused on ${focus}. ` +
    `Core skills: ${skills.join(", ")}. ${fam.achievement}.` +
    (credSummary ? ` Recognitions: ${credSummary}.` : "");
  return {
    id: `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    email: `${fam.key}${i + 1}@smoke.local`,
    displayName: name, headline, location, yearsExperience: years,
    skills, industries, desiredRoles, credentials, text,
    minSalary, workSetups: i % 3 === 0 ? ["remote", "hybrid"] : i % 3 === 1 ? ["hybrid", "onsite"] : ["remote"],
  };
}

type Job = { id: string; recruiterId: string; title: string; description: string; salaryMin: number; salaryMax: number; workSetups: string[]; location: string };

export function buildJobs(recruiters: Recruiter[]): Job[] {
  const techR = recruiters.filter((r) => r.kind === "tech");
  const finR = recruiters.filter((r) => r.kind === "finance");
  return FAMILIES.map((fam, i) => {
    const r = rng(5000 + i * 11);
    const pool = fam.kind === "tech" ? techR : finR;
    const recruiter = pool[i % pool.length]!;
    const seniorYears = 6 + Math.floor(r() * 6);
    const salaryMin = (fam.kind === "finance" ? 90000 : 100000) + seniorYears * 5000;
    const region = i % 2 === 0 ? "Hong Kong" : "Singapore";
    const location = (i % 2 === 0 ? HK_CITIES : SG_CITIES)[i % 5]!;
    return {
      id: `30000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
      recruiterId: recruiter.id,
      title: `${fam.titles[1]}, ${fam.industries[0]} (${region})`,
      description:
        `We are hiring a ${fam.titles[1]!.toLowerCase()} for our ${region} team, focused on ${fam.focus[0]}. ` +
        `Required skills: ${fam.skills.slice(0, 6).join(", ")}. ${fam.achievement}. ${seniorYears}+ years experience.`,
      salaryMin, salaryMax: salaryMin + 45000,
      workSetups: i % 2 === 0 ? ["remote", "hybrid"] : ["hybrid", "onsite"], location,
    };
  });
}

function readJson<T>(name: string): T { return JSON.parse(readFileSync(join(DIR, name), "utf8")); }

async function main() {
  const recruiters = readJson<Recruiter[]>("smoke-recruiters.json");
  const seekers = Array.from({ length: SEEKER_COUNT }, (_, i) => buildSeeker(i));
  const jobs = buildJobs(recruiters);

  const lines: string[] = [
    "-- GENERATED FILE — do not edit by hand.",
    "-- Regenerate with `pnpm test-data:generate`. Procedurally generated from",
    "-- the role families in generate-smoke-seed.ts (deterministic). Dev-only",
    "-- smoke dataset: 50 seekers + 20 jobs (tech + finance) + 8 recruiters,",
    "-- loaded on `supabase db reset` via supabase/config.toml [db.seed] sql_paths.",
    `-- All accounts share the demo password: ${DEMO_PASSWORD}`,
    "",
  ];

  const allAccounts = [
    ...recruiters.map((r) => ({ id: r.id, email: r.email })),
    ...seekers.map((s) => ({ id: s.id, email: s.email })),
  ];
  lines.push(
    "insert into auth.users (",
    "  id, instance_id, aud, role, email, encrypted_password,",
    "  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,",
    "  confirmation_token, recovery_token, email_change, email_change_token_new,",
    "  email_change_token_current, created_at, updated_at",
    ") values",
    allAccounts.map((a) =>
      `  ('${a.id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlString(a.email)}, crypt(${sqlString(DEMO_PASSWORD)}, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', now(), now())`,
    ).join(",\n") + ";",
    "",
  );

  lines.push(
    "insert into auth.identities (",
    "  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at",
    ") values",
    allAccounts.map((a) =>
      `  (gen_random_uuid(), '${a.id}', '${a.id}', '{"sub":"${a.id}","email":"${a.email}"}', 'email', now(), now(), now())`,
    ).join(",\n") + ";",
    "",
  );

  // --- profiles -----------------------------------------------------------
  const profileCols =
    "id, is_seeker, is_recruiter, company_name, display_name, headline, location, " +
    "skills, industries, desired_roles, seniority_band, years_experience, " +
    "credentials, credentials_summary, dealbreaker_matrix, draft_text, published_text";
  lines.push(`insert into profiles (${profileCols}) values`);
  const recruiterRows = recruiters.map((r) =>
    `  ('${r.id}', false, true, ${sqlString(r.companyName)}, ${sqlString(r.displayName)}, null, null, ` +
    `'{}'::text[], '{}'::text[], '{}'::text[], null, null, null, null, null, null, null)`,
  );
  const seekerRows = seekers.map((s) => {
    const dealbreakers = sqlString(JSON.stringify({ min_salary: s.minSalary, currency: "USD", work_setups: s.workSetups }));
    const credSummary = credentialsFloorSummary(s.credentials);
    return (
      `  ('${s.id}', true, false, null, ${sqlString(s.displayName)}, ${sqlString(s.headline)}, ${sqlString(s.location)}, ` +
      `${sqlArray(s.skills)}, ${sqlArray(s.industries)}, ${sqlArray(s.desiredRoles)}, ` +
      `${sqlString(seniorityBand(s.yearsExperience))}, ${s.yearsExperience}, ` +
      `${s.credentials ? sqlString(s.credentials) : "null"}, ${credSummary ? sqlString(credSummary) : "null"}, ` +
      `${dealbreakers}::jsonb, ${sqlString(s.text)}, ${sqlString(s.text)})`
    );
  });
  lines.push([...recruiterRows, ...seekerRows].join(",\n") + ";", "");

  // --- consent_flags ------------------------------------------------------
  lines.push(
    "insert into consent_flags (profile_id, reveal_override_enabled, tos_accepted_at, processing_consent_at, market_signals_opt_in_at, consent_version) values",
    [
      ...recruiters.map((r) => `  ('${r.id}', false, now(), null, null, '2026-07-17-draft')`),
      // seekers opt into market signals so k>=20 cohorts clear
      ...seekers.map((s) => `  ('${s.id}', true, now(), now(), now(), '2026-07-17-draft')`),
    ].join(",\n") + ";",
    "",
  );

  // --- points_ledger ------------------------------------------------------
  lines.push(
    "insert into points_ledger (profile_id, event, amount, note) values",
    [
      ...recruiters.map((r) => `  ('${r.id}', 'seed', ${RECRUITER_SEED_POINTS}, 'smoke-data recruiter activation seed')`),
      ...seekers.map((s) => `  ('${s.id}', 'seed', ${SEEKER_SEED_POINTS}, 'smoke-data seeker activation seed')`),
    ].join(",\n") + ";",
    "",
  );

  // --- skill_vectors (real stub embeddings, credentials folded in) --------
  lines.push("insert into skill_vectors (profile_id, redacted_text, embedding) values");
  const skillRows: string[] = [];
  for (const s of seekers) {
    const { redactedText } = await stubProvider.redact(s.text);
    const credSummary = credentialsFloorSummary(s.credentials);
    const matchingText = [redactedText, credSummary].filter(Boolean).join(" ");
    const embedding = await stubProvider.embed(matchingText);
    skillRows.push(`  ('${s.id}', ${sqlString(redactedText)}, ${sqlVector(embedding)})`);
  }
  lines.push(skillRows.join(",\n") + ";", "");

  // --- job_postings (real stub embeddings) --------------------------------
  lines.push(
    "insert into job_postings (id, recruiter_id, title, description, status, salary_min, salary_max, work_setups, location, embedding) values",
  );
  const jobRows: string[] = [];
  for (const j of jobs) {
    const embedding = await stubProvider.embed(`${j.title}\n\n${j.description}`);
    const workSetups = `array[${j.workSetups.map((w) => sqlString(w)).join(",")}]::work_setup[]`;
    jobRows.push(
      `  ('${j.id}', '${j.recruiterId}', ${sqlString(j.title)}, ${sqlString(j.description)}, 'active', ${j.salaryMin}, ${j.salaryMax}, ${workSetups}, ${sqlString(j.location)}, ${sqlVector(embedding)})`,
    );
  }
  lines.push(jobRows.join(",\n") + ";", "");

  // --- matches via match_candidates(); ~60% interested, staggered time ----
  lines.push("-- Matches computed via match_candidates(), same threshold/top_n as the app.");
  jobs.forEach((j, i) => {
    const interested = i % 5 !== 4; // ~80% of jobs surface interested candidates
    const status = interested ? "interested" : "surfaced";
    const interestedAt = interested ? `now() - interval '${i % 14} days'` : "null";
    lines.push(
      `insert into matches (job_posting_id, profile_id, score, status, interested_at)`,
      `select '${j.id}'::uuid, mc.profile_id, mc.score, '${status}'::match_status, ${interestedAt}`,
      `from match_candidates('${j.id}'::uuid, ${MATCH_THRESHOLD}, ${MATCH_TOP_N}) mc`,
      `on conflict (job_posting_id, profile_id) do nothing;`,
      "",
    );
  });

  const outPath = join(DIR, "smoke-seed.generated.sql");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`Wrote ${outPath}`);
  console.log(`${recruiters.length} recruiters, ${seekers.length} seekers, ${jobs.length} jobs`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
