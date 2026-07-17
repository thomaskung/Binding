import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditor } from "@/app/seeker/profile/profile-editor";

/** Wizard steps 2-3: resume + dealbreakers + publish, reusing the standard
 * profile editor. Skippable — the dashboard shows a finish-profile banner
 * until published. */
export default async function SeekerOnboardingProfilePage() {
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
    <div>
      <div className="mx-auto flex max-w-3xl items-center justify-between px-8 pt-6">
        <p className="text-sm text-muted-foreground">
          Step 2 of 3 — your profile and dealbreakers. Publish to enter the pool.
        </p>
        <Button variant="ghost" size="sm" data-testid="wizard-skip" render={<Link href="/seeker" />}>
          Skip for now
        </Button>
      </div>
      <ProfileEditor
        draftText={profile?.draft_text ?? ""}
        publishedText={profile?.published_text ?? null}
        redactedText={vector?.redacted_text ?? null}
        visibility={(profile?.visibility ?? "active") as "active" | "paused"}
        overrideEnabled={consent?.reveal_override_enabled ?? false}
        minSalary={dealbreakers.min_salary ?? null}
        workSetups={dealbreakers.work_setups ?? []}
      />
    </div>
  );
}
