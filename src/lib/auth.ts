import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionProfile {
  userId: string;
  role: "seeker" | "recruiter" | "enterprise_admin" | null;
  displayName: string;
}

/** Load the signed-in user + their profile row (null role = not onboarded). */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: profile?.role ?? null,
    displayName: profile?.display_name ?? "",
  };
}

/** Require a session with the given role; redirect appropriately otherwise. */
export async function requireRole(
  role: "seeker" | "recruiter",
): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.role) redirect("/onboarding");
  if (session.role !== role) redirect(session.role === "seeker" ? "/seeker" : "/recruiter");
  return session;
}
