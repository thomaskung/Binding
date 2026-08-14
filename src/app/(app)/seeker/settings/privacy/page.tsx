import Link from "next/link";
import { Badge } from "@binding/ui";
import { formatAccessLogRow } from "@/lib/access-log";
import { requireRole } from "@/lib/auth";
import type { FieldVisibilityMap } from "@/lib/field-visibility";
import { dsarExportGuard, dsarNextAvailableAt, DSAR_EXPORT_COOLDOWN_DAYS } from "@/lib/dsar";
import { computePrivacyHealthFlags } from "@/lib/privacy-health";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivacyCard } from "../privacy-card";
import { PrivacySettingsClient } from "../privacy-settings-client";

const PRIVACY_HEALTH_FIELD_KEYS = [
  "headline",
  "location",
  "skills",
  "desired_roles",
  "industries",
  "references_available",
  "credentials",
] as const;

/** /seeker/settings/privacy (DESIGN.md §13e base + §14j deepening, Phase 6):
 * single source of truth for privacy/consent controls that used to live
 * inline in the seeker profile "Privacy" card — that page now keeps only a
 * link (src/app/(app)/seeker/profile/profile-fields.tsx). */
export default async function SeekerPrivacySettingsPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();
  // connected_accounts + resumes + get_my_access_log() results are read via
  // the admin client where the table has no authenticated RLS policy
  // (connected_accounts, migration 0026) or where we need every row
  // regardless of policy nuance (resumes, to check "any original on file");
  // get_my_access_log() itself is a SECURITY DEFINER RPC meant to be called
  // by the regular session-bound client (it self-scopes to auth.uid()).
  const admin = createSupabaseAdminClient();

  const [{ data: profile }, { data: consent }, { data: driveAccount }, { data: resumes }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "visibility, field_visibility, headline, location, skills, desired_roles, industries, references_available, credentials, seeker_tier, notify_new_matches, notify_reveal_activity, notify_product_updates, dsar_last_exported_at",
        )
        .eq("id", session.userId)
        .single(),
      supabase
        .from("consent_flags")
        .select(
          "tos_accepted_at, reveal_override_enabled, contact_sharing_consent, market_signals_opt_in_at, maintenance_consent_at, connected_accounts_opt_in_at, agent_access_opt_in_at",
        )
        .eq("profile_id", session.userId)
        .maybeSingle(),
      admin
        .from("connected_accounts")
        .select("id")
        .eq("profile_id", session.userId)
        .eq("provider", "google_drive")
        .maybeSingle(),
      admin.from("resumes").select("id").eq("profile_id", session.userId).limit(1),
    ]);

  const { data: accessLog } = await supabase.rpc("get_my_access_log");

  const fieldVisibility = (profile?.field_visibility ?? {}) as FieldVisibilityMap;
  const now = new Date();

  const healthFlags = computePrivacyHealthFlags({
    now,
    coreConsentAcceptedAt: consent?.tos_accepted_at ? new Date(consent.tos_accepted_at) : null,
    maintenanceConsented: consent?.maintenance_consent_at != null,
    profileVisibility: (profile?.visibility ?? "active") as "active" | "paused",
    overrideEnabled: consent?.reveal_override_enabled ?? false,
    fieldVisibility,
    privacyFieldKeys: PRIVACY_HEALTH_FIELD_KEYS,
  });

  const lastExportedAt = profile?.dsar_last_exported_at
    ? new Date(profile.dsar_last_exported_at)
    : null;
  const dsarGuardInput = { lastExportedAt, now, cooldownDays: DSAR_EXPORT_COOLDOWN_DAYS };
  const dsarAvailable = dsarExportGuard(dsarGuardInput) === null;
  const nextAvailable = dsarNextAvailableAt(dsarGuardInput);

  interface AccessLogRpcRow {
    id: string;
    created_at: string;
    resource: string;
    action: string;
    company_name: string | null;
    accessor_id: string | null;
    recruiter_display_name: string | null;
  }
  const rows = (accessLog ?? []) as AccessLogRpcRow[];

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
            Privacy settings
          </h1>
          {profile?.seeker_tier === "pro" && <Badge variant="outline">Pro</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Consent, visibility, and data controls in one place.{" "}
          <Link href="/seeker/profile" className="underline">
            Back to your profile
          </Link>
        </p>
      </header>

      {healthFlags.length > 0 && (
        <section
          data-testid="privacy-health-panel"
          className="space-y-2 rounded-lg border border-border bg-muted/40 p-4"
        >
          <h2 className="text-sm font-semibold">Privacy health</h2>
          <ul className="space-y-1.5">
            {healthFlags.slice(0, 3).map((flag) => (
              <li key={flag.id} data-testid={`privacy-flag-${flag.id}`} className="text-sm">
                <Badge variant={flag.severity === "warning" ? "destructive" : "secondary"} className="mr-2">
                  {flag.severity}
                </Badge>
                {flag.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PrivacyCard
        fieldVisibility={fieldVisibility}
        headline={profile?.headline ?? ""}
        location={profile?.location ?? ""}
        skills={profile?.skills ?? []}
        desiredRoles={profile?.desired_roles ?? []}
        industries={profile?.industries ?? []}
        referencesAvailable={profile?.references_available ?? false}
        credentials={profile?.credentials ?? ""}
      />

      <PrivacySettingsClient
        overrideEnabled={consent?.reveal_override_enabled ?? false}
        contactSharingConsent={consent?.contact_sharing_consent ?? false}
        marketSignalsOptedIn={consent?.market_signals_opt_in_at != null}
        marketSignalsAcceptedAt={consent?.market_signals_opt_in_at ?? null}
        maintenanceConsented={consent?.maintenance_consent_at != null}
        maintenanceAcceptedAt={consent?.maintenance_consent_at ?? null}
        connectedAccountsOptedIn={consent?.connected_accounts_opt_in_at != null}
        connectedAccountsAcceptedAt={consent?.connected_accounts_opt_in_at ?? null}
        driveConnected={driveAccount != null}
        agentAccessOptedIn={consent?.agent_access_opt_in_at != null}
        agentAccessAcceptedAt={consent?.agent_access_opt_in_at ?? null}
        coreConsentAcceptedAt={consent?.tos_accepted_at ?? null}
        profilePaused={(profile?.visibility ?? "active") === "paused"}
        notifyNewMatches={profile?.notify_new_matches ?? true}
        notifyRevealActivity={profile?.notify_reveal_activity ?? true}
        notifyProductUpdates={profile?.notify_product_updates ?? false}
        hasOriginalResume={(resumes ?? []).length > 0}
        dsarAvailable={dsarAvailable}
        dsarNextAvailableAt={nextAvailable ? nextAvailable.toISOString() : null}
      />

      <section
        data-testid="access-log-ledger"
        className="space-y-3 rounded-lg border border-border p-4"
      >
        <h2 className="text-sm font-semibold">Who accessed my data</h2>
        <p className="text-xs text-muted-foreground">
          Company names are always shown (already visible on the job posting itself). Recruiter
          personal names are shown to Pro-tier seekers only, unless the recruiter has opted to keep
          their name withheld here too.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="access-log-empty">
            No one has accessed your data yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const formatted = formatAccessLogRow({
                id: row.id,
                createdAt: row.created_at,
                resource: row.resource,
                action: row.action,
                companyName: row.company_name,
                recruiterDisplayName: row.recruiter_display_name,
              });
              return (
                <li
                  key={formatted.id}
                  data-testid="access-log-row"
                  className="flex flex-col gap-0.5 border-b border-border/60 py-2 text-sm last:border-b-0"
                >
                  <span>
                    <span className="font-medium" data-testid="access-log-recruiter-label">
                      {formatted.recruiterLabel}
                    </span>{" "}
                    from{" "}
                    <span className="font-medium" data-testid="access-log-company-label">
                      {formatted.companyName}
                    </span>{" "}
                    {formatted.actionLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(formatted.createdAt).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
