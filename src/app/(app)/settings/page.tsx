import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { coerceRecruiterTier } from "@/lib/recruiter-tier";
import { DevTierToggle } from "../seeker/dev-tier-toggle";
import { DevRecruiterTierToggle } from "../recruiter/dev-tier-toggle";
import { HideNameToggle } from "./hide-name-toggle";

/** Settings page: tier toggle controls for dev environments (relocation from
 * app-shell dropdown), plus the minimal recruiter-facing Privacy section
 * (DESIGN.md §13e: "Recruiter gets minimal Privacy + Security pages") — just
 * the hide_name_on_reveal opt-out this phase adds, kept small per the Phase 6
 * brief rather than a full dedicated /recruiter/settings route. Shows a
 * toggle per role the account actually holds — both, for dual-role accounts,
 * not just whichever is currently active. */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_seeker, is_recruiter, seeker_tier, recruiter_tier, hide_name_on_reveal")
    .eq("id", user.id)
    .maybeSingle();

  const seekerTier = profile?.seeker_tier === "pro" ? "pro" : "free";
  const recruiterTier = coerceRecruiterTier(profile?.recruiter_tier);

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account preferences and tier access.
        </p>
      </header>

      <div className="space-y-4">
        {profile?.is_seeker && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Seeker tier</h2>
            <DevTierToggle tier={seekerTier} />
          </div>
        )}

        {profile?.is_recruiter && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Recruiter tier</h2>
            <DevRecruiterTierToggle tier={recruiterTier} />
          </div>
        )}

        {profile?.is_recruiter && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Privacy</h2>
            <HideNameToggle initialValue={profile?.hide_name_on_reveal ?? false} />
          </div>
        )}
      </div>
    </main>
  );
}
