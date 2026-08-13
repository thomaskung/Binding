"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

export async function deleteAccount(): Promise<void> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const admin = createSupabaseAdminClient();

  // 1. Soft-close recruiter job postings
  await admin
    .from("job_postings")
    .update({ status: "closed" })
    .eq("recruiter_id", session.userId);

  // 2. Delete resume files from Storage
  const { data: resumes } = await admin
    .from("resumes")
    .select("storage_path")
    .eq("profile_id", session.userId);

  if (resumes) {
    const paths = resumes.map((r) => r.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await admin.storage.from("resumes").remove(paths);
    }
  }

  // 3. Sanitize points_ledger before cascade delete — detach from profile,
  //    de-identify event/note text so rows survive as anonymous audit trail
  await admin
    .from("points_ledger")
    .update({ profile_id: null, event: "account_closed", note: null })
    .eq("profile_id", session.userId);

  // 4. Cascade delete auth.users → profiles → skill_vectors, resumes,
  //    consent_flags, seeker_experience, matches, reveal_requests,
  //    messages, message_threads, notifications, pii_access_log,
  //    connected_accounts (migration 0026, `on delete cascade` — no plaintext
  //    OAuth token survives account deletion, no separate revoke-at-Google
  //    call needed for that guarantee)
  const { error } = await admin.auth.admin.deleteUser(session.userId);
  if (error) throw new Error(`Account deletion failed: ${error.message}`);

  // 5. Sign out + redirect
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
