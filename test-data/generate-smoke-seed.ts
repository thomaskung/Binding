/**
 * Generates test-data/smoke-seed.generated.sql from the JSON files in this
 * directory. Run with `pnpm test-data:generate` whenever the JSON changes.
 *
 * Uses the real stub embedding/redaction logic (src/lib/ai/stub.ts) so match
 * scores are realistic and varied, unlike the placeholder unit vector in
 * supabase/seed.sql. Output is a static, checked-in SQL file — no JS runs at
 * `supabase db reset` time, only plain SQL (loaded via config.toml sql_paths).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stubProvider } from "../src/lib/ai/stub";

const DIR = import.meta.dirname;
const DEMO_PASSWORD = "J0B!Demo#2026$secure";
const MATCH_THRESHOLD = 0.55;
const MATCH_TOP_N = 20;
const SEEKER_SEED_POINTS = 10;
const RECRUITER_SEED_POINTS = 100;

type Recruiter = { id: string; email: string; displayName: string; companyName: string };
type Seeker = {
  id: string;
  email: string;
  displayName: string;
  text: string;
  minSalary: number;
  workSetups: string[];
};
type Job = {
  id: string;
  recruiterId: string;
  title: string;
  description: string;
  salaryMin: number;
  salaryMax: number;
  workSetups: string[];
};

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8"));
}

export function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function sqlVector(embedding: number[]): string {
  return `'[${embedding.join(",")}]'::vector(1024)`;
}

async function main() {
  const recruiters = readJson<Recruiter[]>("smoke-recruiters.json");
  const seekers = readJson<Seeker[]>("smoke-seekers.json");
  const jobs = readJson<Job[]>("smoke-jobs.json");

  const lines: string[] = [
    "-- GENERATED FILE — do not edit by hand.",
    "-- Regenerate with `pnpm test-data:generate` after changing the JSON files",
    "-- in test-data/. Dev-only smoke dataset: loaded automatically on",
    "-- `supabase db reset` via supabase/config.toml [db.seed] sql_paths.",
    `-- All accounts share the demo password: ${DEMO_PASSWORD}`,
    "",
  ];

  // --- auth.users + auth.identities (recruiters then seekers) -----------
  const allAccounts = [
    ...recruiters.map((r) => ({ id: r.id, email: r.email })),
    ...seekers.map((s) => ({ id: s.id, email: s.email })),
  ];
  lines.push("insert into auth.users (");
  lines.push(
    "  id, instance_id, aud, role, email, encrypted_password,",
    "  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,",
    "  confirmation_token, recovery_token, email_change, email_change_token_new,",
    "  email_change_token_current,",
    "  created_at, updated_at",
    ") values",
  );
  lines.push(
    allAccounts
      .map(
        (a) =>
          `  ('${a.id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlString(a.email)}, crypt(${sqlString(DEMO_PASSWORD)}, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', now(), now())`,
      )
      .join(",\n") + ";",
  );
  lines.push("");

  lines.push(
    "insert into auth.identities (",
    "  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at",
    ") values",
  );
  lines.push(
    allAccounts
      .map(
        (a) =>
          `  (gen_random_uuid(), '${a.id}', '${a.id}', '{"sub":"${a.id}","email":"${a.email}"}', 'email', now(), now(), now())`,
      )
      .join(",\n") + ";",
  );
  lines.push("");

  // --- profiles -----------------------------------------------------------
  lines.push(
    "insert into profiles (id, is_seeker, is_recruiter, company_name, display_name, dealbreaker_matrix, draft_text, published_text) values",
  );
  const recruiterProfileRows = recruiters.map(
    (r) =>
      `  ('${r.id}', false, true, ${sqlString(r.companyName)}, ${sqlString(r.displayName)}, null, null, null)`,
  );
  const seekerProfileRows = seekers.map((s) => {
    const dealbreakers = sqlString(
      JSON.stringify({ min_salary: s.minSalary, currency: "USD", work_setups: s.workSetups }),
    );
    return `  ('${s.id}', true, false, null, ${sqlString(s.displayName)}, ${dealbreakers}::jsonb, ${sqlString(s.text)}, ${sqlString(s.text)})`;
  });
  lines.push([...recruiterProfileRows, ...seekerProfileRows].join(",\n") + ";");
  lines.push("");

  // --- consent_flags --------------------------------------------------
  lines.push(
    "insert into consent_flags (profile_id, reveal_override_enabled, tos_accepted_at, processing_consent_at, consent_version) values",
  );
  const consentRows = [
    ...recruiters.map((r) => `  ('${r.id}', false, now(), null, '2026-07-17-draft')`),
    ...seekers.map((s) => `  ('${s.id}', true, now(), now(), '2026-07-17-draft')`),
  ];
  lines.push(consentRows.join(",\n") + ";");
  lines.push("");

  // --- points_ledger --------------------------------------------------
  lines.push("insert into points_ledger (profile_id, event, amount, note) values");
  const pointsRows = [
    ...recruiters.map(
      (r) => `  ('${r.id}', 'seed', ${RECRUITER_SEED_POINTS}, 'smoke-data recruiter activation seed')`,
    ),
    ...seekers.map(
      (s) => `  ('${s.id}', 'seed', ${SEEKER_SEED_POINTS}, 'smoke-data seeker activation seed')`,
    ),
  ];
  lines.push(pointsRows.join(",\n") + ";");
  lines.push("");

  // --- skill_vectors (real stub embeddings) ---------------------------
  lines.push("insert into skill_vectors (profile_id, redacted_text, embedding) values");
  const skillRows: string[] = [];
  for (const s of seekers) {
    const { redactedText } = await stubProvider.redact(s.text);
    const embedding = await stubProvider.embed(redactedText);
    skillRows.push(`  ('${s.id}', ${sqlString(redactedText)}, ${sqlVector(embedding)})`);
  }
  lines.push(skillRows.join(",\n") + ";");
  lines.push("");

  // --- job_postings (real stub embeddings) ----------------------------
  lines.push(
    "insert into job_postings (id, recruiter_id, title, description, status, salary_min, salary_max, work_setups, embedding) values",
  );
  const jobRows: string[] = [];
  for (const j of jobs) {
    // Mirrors src/app/recruiter/actions.ts: embed(`${title}\n\n${description}`).
    const embedding = await stubProvider.embed(`${j.title}\n\n${j.description}`);
    const workSetups = `array[${j.workSetups.map((w) => sqlString(w)).join(",")}]::work_setup[]`;
    jobRows.push(
      `  ('${j.id}', '${j.recruiterId}', ${sqlString(j.title)}, ${sqlString(j.description)}, 'active', ${j.salaryMin}, ${j.salaryMax}, ${workSetups}, ${sqlVector(embedding)})`,
    );
  }
  lines.push(jobRows.join(",\n") + ";");
  lines.push("");

  // --- matches, computed via the real match_candidates() RPC -----------
  // Each job in this dataset only clears the threshold for ~1 candidate, so a
  // within-job score split can't produce variety. Alternate status by job
  // index instead — deterministic, and exercises both the recruiter's
  // RevealButton ('interested') and waiting-on-candidate ('surfaced') paths.
  lines.push(
    "-- Matches computed via match_candidates(), same threshold/top_n as the app (src/lib/matching.ts).",
  );
  jobs.forEach((j, i) => {
    const status = i % 2 === 0 ? "interested" : "surfaced";
    lines.push(
      `insert into matches (job_posting_id, profile_id, score, status)`,
      `select '${j.id}'::uuid, mc.profile_id, mc.score, '${status}'::match_status`,
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
