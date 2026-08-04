import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/points";
import { isStale } from "@/lib/profile";
import { suggestionForRecruiter, suggestionForSeeker } from "@/lib/nav-suggestion";
import { coerceRecruiterTier } from "@/lib/recruiter-tier";
import { AppShell } from "@/components/app-shell";

/** Shell wrapper for every authenticated in-app route (DESIGN.md-adjacent —
 * see the app-shell plan). A route group, not a URL segment: `/seeker`,
 * `/benefits`, etc. keep their exact paths. Landing, auth, and onboarding
 * stay outside this group entirely, on their own `AuthNav` chrome. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_seeker, is_recruiter, display_name, company_name, seeker_tier, recruiter_tier, last_profile_activity_at")
    .eq("id", user.id)
    .maybeSingle();

  const balance = await getBalance(supabase, user.id);
  const cookieJar = await cookies();
  const cookieRole = cookieJar.get("job_active_role")?.value;
  const railOpenCookie = cookieJar.get("rail_open")?.value;

  // Header AI-suggestion chip: both roles' signals are computed here (rather
  // than duplicating AppShell's route/cookie role-resolution logic) — the
  // client component just picks whichever one matches its own resolved role.
  let aiSuggestionSeeker: string | null = null;
  if (profile?.is_seeker) {
    const { count: newMatchCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("status", "surfaced");
    aiSuggestionSeeker = suggestionForSeeker(
      isStale(profile.last_profile_activity_at),
      newMatchCount ?? 0,
    );
  }

  let aiSuggestionRecruiter: string | null = null;
  if (profile?.is_recruiter) {
    // RLS (matches_recruiter_select -> is_job_owner) already restricts this
    // to matches on this recruiter's own job postings — no join needed.
    const { count: pendingCount } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("status", "interested");
    aiSuggestionRecruiter = suggestionForRecruiter(pendingCount ?? 0);
  }

  return (
    <Suspense>
      <AppShell
        isSeeker={profile?.is_seeker ?? false}
        isRecruiter={profile?.is_recruiter ?? false}
        displayName={profile?.display_name ?? ""}
        companyName={profile?.company_name ?? null}
        seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
        recruiterTier={coerceRecruiterTier(profile?.recruiter_tier)}
        points={balance}
        cookieRole={cookieRole === "recruiter" || cookieRole === "seeker" ? cookieRole : null}
        initialRailOpen={railOpenCookie === "1"}
        aiSuggestionSeeker={aiSuggestionSeeker}
        aiSuggestionRecruiter={aiSuggestionRecruiter}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
