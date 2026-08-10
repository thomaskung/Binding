// Uploads UAT evidence (screenshots + DOM state) from the uat-evidence job's
// `e2e-results/<RUN_ID>/` directory into the `staging-test-evidence` Supabase
// Storage bucket that the `score-uat` step reads from (see
// `.github/workflows/e2e-staging.yml` + `.opencode/agent/uat-scorer.md`).
//
// Run in CI only (needs the service-role key); the scorer uses the separate
// read-only key. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RUN_ID.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "fs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const runId = process.env.RUN_ID;

if (!url || !key) throw new Error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!runId) throw new Error("missing RUN_ID");

const dir = `e2e-results/${runId}`;
if (!existsSync(dir)) {
  console.warn(`No evidence at ${dir} — skipping upload`);
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// The scorer reads from this bucket; create it if a run predates the first
// upload. supabase-js storage methods return { data, error } rather than
// throwing — check the returned error instead of catching.
const { error: bucketError } = await supabase.storage.createBucket("staging-test-evidence", {
  public: false,
});
if (bucketError && !/already exists/i.test(bucketError.message ?? "")) {
  throw new Error(`createBucket failed: ${bucketError.message}`);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".png") || f.endsWith(".html"));
if (files.length === 0) {
  console.warn(`No evidence files in ${dir} — skipping upload`);
  process.exit(0);
}

let uploaded = 0;
for (const file of files) {
  const buf = readFileSync(`${dir}/${file}`);
  const contentType = file.endsWith(".html") ? "text/html" : "image/png";
  const { error } = await supabase.storage
    .from("staging-test-evidence")
    .upload(`${runId}/${file}`, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload ${file} failed: ${error.message}`);
  uploaded++;
}

console.log(`Uploaded ${uploaded} evidence files for run ${runId}`);
