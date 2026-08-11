// Deletes stale staging test users (created per-run by e2e/staging-helpers.ts
// ensureStagingUser with @staging.local emails) that are older than 24h.
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

const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const { data: users, error } = await admin.auth.admin.listUsers();
if (error) {
  console.error("listUsers failed:", error.message);
  process.exit(1);
}

const stale = users.users.filter(
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
