import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";

export default async function SeekerProfilePage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: consent }, { data: vector }] = await Promise.all([
    supabase
      .from("profiles")
      .select("draft_text, published_text, visibility, dealbreaker_matrix")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("consent_flags")
      .select("reveal_override_enabled")
      .eq("profile_id", session.userId)
      .maybeSingle(),
    supabase
      .from("skill_vectors")
      .select("redacted_text")
      .eq("profile_id", session.userId)
      .maybeSingle(),
  ]);

  const dealbreakers = (profile?.dealbreaker_matrix ?? {}) as {
    min_salary?: number | null;
    work_setups?: string[];
  };

  return (
    <ProfileEditor
      draftText={profile?.draft_text ?? ""}
      publishedText={profile?.published_text ?? null}
      redactedText={vector?.redacted_text ?? null}
      visibility={(profile?.visibility ?? "active") as "active" | "paused"}
      overrideEnabled={consent?.reveal_override_enabled ?? false}
      minSalary={dealbreakers.min_salary ?? null}
      workSetups={dealbreakers.work_setups ?? []}
    />
  );
}
