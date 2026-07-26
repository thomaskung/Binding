import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResumeCanvas } from "./resume-canvas";

/** Resume editor canvas at its own route — the NavShell template's Profile
 * surface; the structured fields page at /seeker/profile links here. */
export default async function ResumeCanvasPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: vector }] = await Promise.all([
    supabase
      .from("profiles")
      .select("draft_text, seeker_tier")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("skill_vectors")
      .select("redacted_text")
      .eq("profile_id", session.userId)
      .maybeSingle(),
  ]);

  return (
    <ResumeCanvas
      draftText={profile?.draft_text ?? ""}
      redactedText={vector?.redacted_text ?? null}
      seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
    />
  );
}
