// Deletes stale staging test users (created per-run by e2e/staging-helpers.ts
// ensureStagingUser with @staging.local emails) that are older than 60
// minutes. Triggered right after the nightly "Staging E2E" workflow
// completes (cleanup-staging.yml) rather than on a fixed cron gap, so a
// 60-minute buffer — not 0 — is the safety margin: @staging.local is shared
// with every PR-gate e2e run (ci.yml) too, which has no per-run id to
// distinguish from the nightly run's own users, so an unbuffered sweep could
// delete a concurrently-running PR check's users mid-test. PR-gate runs
// finish in ~10 minutes (see CLAUDE.md), well inside this buffer.
// Kept as a committed script (not a /tmp heredoc) so the workflow can resolve
// @supabase/supabase-js from the repo's node_modules after `pnpm install`.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

// listUsers is paginated (50 per page by default) — fetch every page or the
// oldest (stale) users, which sort later, are never seen.
const allUsers = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  allUsers.push(...data.users);
  if (data.users.length < 200) break;
}

const stale = allUsers.filter(
  (u) => u.email?.endsWith("@staging.local") && new Date(u.created_at) < new Date(cutoff),
);

console.log(`Found ${stale.length} stale test users to clean up`);

for (const user of stale) {
  // Sanitize points_ledger before cascade delete.
  await admin
    .from("points_ledger")
    .update({ profile_id: null, event: "account_closed", note: null })
    .eq("profile_id", user.id);

  const { error: delError } = await admin.auth.admin.deleteUser(user.id, true);
  if (delError) {
    console.error(`Failed to delete ${user.email}: ${delError.message}`);
  } else {
    console.log(`Deleted ${user.email}`);
  }
}

console.log("Cleanup complete");
