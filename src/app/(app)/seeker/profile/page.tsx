import { requireRole } from "@/lib/auth";
import type { FieldVisibilityMap } from "@/lib/field-visibility";
import { getBalance } from "@/lib/points";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileFields } from "./profile-fields";

export default async function SeekerProfilePage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [{ data: profile }, { data: consent }, { data: experience }, balance, { data: ledger }, { data: auth }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, draft_text, published_text, visibility, dealbreaker_matrix, headline, phone, location, skills, desired_roles, industries, references_available, share_salary, credentials, credentials_summary, field_visibility, seeker_tier",
        )
        .eq("id", session.userId)
        .single(),
      supabase
        .from("consent_flags")
        .select("reveal_override_enabled, market_signals_opt_in_at, maintenance_consent_at")
        .eq("profile_id", session.userId)
        .maybeSingle(),
      supabase
        .from("seeker_experience")
        .select("id, role, company, industry, start_date, end_date")
        .eq("profile_id", session.userId)
        .order("start_date", { ascending: false }),
      getBalance(supabase, session.userId),
      supabase
        .from("points_ledger")
        .select("event, amount, note, created_at")
        .eq("profile_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.auth.getUser(),
    ]);

  const dealbreakers = (profile?.dealbreaker_matrix ?? {}) as {
    min_salary?: number | null;
    work_setups?: string[];
    equity_required?: boolean;
  };

  return (
    <ProfileFields
      displayName={profile?.display_name ?? ""}
      email={auth.user?.email ?? ""}
      seekerTier={profile?.seeker_tier === "pro" ? "pro" : "free"}
      draftText={profile?.draft_text ?? ""}
      publishedText={profile?.published_text ?? null}
      visibility={(profile?.visibility ?? "active") as "active" | "paused"}
      overrideEnabled={consent?.reveal_override_enabled ?? false}
      marketSignalsOptedIn={consent?.market_signals_opt_in_at != null}
      maintenanceConsented={consent?.maintenance_consent_at != null}
      minSalary={dealbreakers.min_salary ?? null}
      workSetups={dealbreakers.work_setups ?? []}
      equityRequired={dealbreakers.equity_required ?? false}
      headline={profile?.headline ?? ""}
      phone={profile?.phone ?? ""}
      location={profile?.location ?? ""}
      skills={profile?.skills ?? []}
      desiredRoles={profile?.desired_roles ?? []}
      industries={profile?.industries ?? []}
      referencesAvailable={profile?.references_available ?? false}
      shareSalary={profile?.share_salary ?? false}
      credentials={profile?.credentials ?? ""}
      credentialsSummary={profile?.credentials_summary ?? null}
      fieldVisibility={(profile?.field_visibility ?? {}) as FieldVisibilityMap}
      experience={(experience ?? []).map((e) => ({
        id: e.id,
        role: e.role,
        company: e.company,
        industry: e.industry,
        startDate: e.start_date,
        endDate: e.end_date,
      }))}
      pointsBalance={balance}
      pointsHistory={(ledger ?? []).map((l) => ({
        label: l.note ?? l.event,
        delta: l.amount > 0 ? `+${l.amount}` : `${l.amount}`,
      }))}
    />
  );
}
