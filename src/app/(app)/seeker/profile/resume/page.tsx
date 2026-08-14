import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { isResumeEncryptionEnabled } from "../../key-custody-actions";
import { ResumeCanvas } from "./resume-canvas";

/** Resume editor canvas at its own route — the NavShell template's Profile
 * surface; the structured fields page at /seeker/profile links here. */
export default async function ResumeCanvasPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  // connected_accounts is service-role-only RLS (migration 0026) — read via
  // the admin client, same as the /seeker/profile page's status check.
  // Folded into the Promise.all below so it doesn't add a serial round-trip.
  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: vector }, { data: experience }, { data: driveAccount }, encryptionEnabled] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, draft_text, headline, skills, desired_roles, industries, seeker_tier")
        .eq("id", session.userId)
        .single(),
      supabase
        .from("skill_vectors")
        .select("redacted_text")
        .eq("profile_id", session.userId)
        .maybeSingle(),
      supabase
        .from("seeker_experience")
        .select("role, company, industry, start_date, end_date")
        .eq("profile_id", session.userId),
      admin
        .from("connected_accounts")
        .select("id")
        .eq("profile_id", session.userId)
        .eq("provider", "google_drive")
        .maybeSingle(),
      isResumeEncryptionEnabled(),
    ]);

  return (
    <ResumeCanvas
      draftText={profile?.draft_text ?? ""}
      redactedText={vector?.redacted_text ?? null}
      driveConnected={driveAccount != null}
      encryptionEnabled={encryptionEnabled}
      seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
      displayName={profile?.display_name ?? ""}
      headline={profile?.headline ?? null}
      skills={profile?.skills ?? []}
      desiredRoles={profile?.desired_roles ?? []}
      industries={profile?.industries ?? []}
      experience={(experience ?? []).map((e) => ({
        role: e.role,
        company: e.company,
        startDate: e.start_date,
        endDate: e.end_date,
        industry: e.industry,
      }))}
    />
  );
}
