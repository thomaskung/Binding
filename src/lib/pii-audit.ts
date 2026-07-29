import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Append-only PII access audit trail (migration 0017, DESIGN.md §2f Layer-1/
 * Layer-3 controls). Scope: CROSS-PARTY access only — recruiter identity
 * disclosure via the reveal flows today, the internal ops panel's
 * break-glass unmask later. Owner self-access is deliberately not logged
 * (it would drown the accountability signal in routine noise).
 *
 * Service-role only table — must be called with the admin client. Audit
 * failure must never abort the audited action silently succeeding first, so
 * callers log AFTER the disclosure commit; a failure here throws and
 * surfaces (better a loud error than an unaudited disclosure pattern).
 */
export type PiiResource = "candidate_identity" | "raw_resume" | "contact_info";

export async function logPiiAccess(
  admin: SupabaseClient,
  entry: {
    accessorId: string;
    accessorRole: "recruiter" | "support" | "ta_service";
    subjectId: string;
    resource: PiiResource;
    action: string;
    reason?: string;
  },
): Promise<void> {
  const { error } = await admin.from("pii_access_log").insert({
    accessor_id: entry.accessorId,
    accessor_role: entry.accessorRole,
    subject_id: entry.subjectId,
    resource: entry.resource,
    action: entry.action,
    reason: entry.reason ?? null,
  });
  if (error) throw new Error(`pii access log failed: ${error.message}`);
}
