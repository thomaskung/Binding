import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionProfile {
  userId: string;
  isSeeker: boolean;
  isRecruiter: boolean;
  displayName: string;
  companyName: string | null;
  /** true when a profiles row exists at all (user finished some onboarding) */
  onboarded: boolean;
}

/** Load the signed-in user + their profile row. Dual-role model: an account
 * holds seeker and/or recruiter roles, both opt-in (DESIGN.md §2a). */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_seeker, is_recruiter, display_name, company_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    isSeeker: profile?.is_seeker ?? false,
    isRecruiter: profile?.is_recruiter ?? false,
    displayName: profile?.display_name ?? "",
    companyName: profile?.company_name ?? null,
    onboarded: profile != null && ((profile.is_seeker ?? false) || (profile.is_recruiter ?? false)),
  };
}

/** Require a session holding the given role for this route context.
 * Not signed in -> /login. No roles -> /onboarding. Missing this specific
 * role -> that role's opt-in step (dual-role accounts add roles over time). */
export async function requireRole(role: "seeker" | "recruiter"): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.onboarded) redirect("/onboarding");
  if (role === "seeker" && !session.isSeeker) redirect("/onboarding/seeker");
  if (role === "recruiter" && !session.isRecruiter) redirect("/onboarding/recruiter");
  return session;
}
