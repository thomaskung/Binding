import { requireRole } from "@/lib/auth";
import { isStale } from "@/lib/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MaintenanceNudge } from "./maintenance-nudge";

/** Continuous-maintenance nudge (DESIGN.md §2c loop) — the dashboard's stale
 * frame (frame C) links here. Ask -> AI-drafted suggest-and-approve diff ->
 * accept republishes (clearing staleness) or discard leaves the profile
 * untouched. */
export default async function MaintenanceNudgePage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: latestRole }, { data: consent }] = await Promise.all([
    supabase
      .from("profiles")
      .select("published_text, last_profile_activity_at")
      .eq("id", session.userId)
      .single(),
    supabase
      .from("seeker_experience")
      .select("role, company, start_date, end_date")
      .eq("profile_id", session.userId)
      .order("end_date", { ascending: false, nullsFirst: true })
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("consent_flags")
      .select("maintenance_consent_at")
      .eq("profile_id", session.userId)
      .maybeSingle(),
  ]);

  const year = (d: string | null) => (d ? new Date(d).getFullYear() : null);
  const latestExperienceLine = latestRole
    ? `${latestRole.role}, ${latestRole.company} (${year(latestRole.start_date) ?? "—"}–${
        year(latestRole.end_date) ?? "present"
      })`
    : null;

  return (
    <main className="mx-auto w-full max-w-[460px] px-5 py-14">
      <MaintenanceNudge
        stale={isStale(profile?.last_profile_activity_at ?? null)}
        latestRole={latestRole?.role ?? null}
        latestCompany={latestRole?.company ?? null}
        latestExperienceLine={latestExperienceLine}
        maintenanceConsented={consent?.maintenance_consent_at != null}
      />
    </main>
  );
}
