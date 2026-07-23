import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/points";
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
    .select("is_seeker, is_recruiter, display_name, company_name, seeker_tier")
    .eq("id", user.id)
    .maybeSingle();

  const balance = await getBalance(supabase, user.id);

  return (
    <Suspense>
      <AppShell
        isSeeker={profile?.is_seeker ?? false}
        isRecruiter={profile?.is_recruiter ?? false}
        displayName={profile?.display_name ?? ""}
        companyName={profile?.company_name ?? null}
        seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
        points={balance}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
