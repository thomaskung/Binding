"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Separator } from "@binding/ui";
import { CONSENT_REGISTRY } from "@/lib/consent";
import {
  deleteOriginalResume,
  exportMyData,
  updateAgentAccessConsent,
  updateConnectedAccountsConsent,
  updateContactSharingConsent,
  updateMaintenanceConsent,
  updateMarketSignalsConsent,
  updateNotificationPreference,
  updateOverrideEnabled,
  updateProfileVisibility,
} from "../actions";

/** Consent center + the rest of the Privacy settings page's interactive
 * controls (DESIGN.md §14j). One client component, same "one big page
 * component, small pure helpers underneath" shape as
 * src/app/(app)/seeker/profile/profile-fields.tsx — the field-visibility
 * pills live separately in ./privacy-card.tsx per the extraction the task
 * asked for explicitly. */

function ToggleRow({
  testId,
  label,
  description,
  checked,
  disabled,
  onToggle,
  footer,
}: {
  testId: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="space-y-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-[13px] leading-normal text-muted-foreground">{description}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          data-testid={`${testId}-toggle`}
          onClick={onToggle}
          className={
            "relative h-6 w-10 flex-none rounded-full transition-colors " +
            (checked ? "bg-primary" : "bg-secondary")
          }
        >
          <span
            className={
              "absolute top-0.5 size-5 rounded-full bg-primary-foreground shadow transition-[left] " +
              (checked ? "left-[18px]" : "left-0.5")
            }
          />
        </button>
      </div>
      {footer}
    </div>
  );
}

export interface PrivacySettingsClientProps {
  overrideEnabled: boolean;
  contactSharingConsent: boolean;
  marketSignalsOptedIn: boolean;
  marketSignalsAcceptedAt: string | null;
  maintenanceConsented: boolean;
  maintenanceAcceptedAt: string | null;
  connectedAccountsOptedIn: boolean;
  connectedAccountsAcceptedAt: string | null;
  driveConnected: boolean;
  agentAccessOptedIn: boolean;
  agentAccessAcceptedAt: string | null;
  coreConsentAcceptedAt: string | null;
  profilePaused: boolean;
  notifyNewMatches: boolean;
  notifyRevealActivity: boolean;
  notifyProductUpdates: boolean;
  hasOriginalResume: boolean;
  dsarAvailable: boolean;
  dsarNextAvailableAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "not granted";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PrivacySettingsClient(props: PrivacySettingsClientProps) {
  const [overrideEnabled, setOverrideEnabled] = useState(props.overrideEnabled);
  const [contactSharingConsent, setContactSharingConsent] = useState(props.contactSharingConsent);
  const [marketSignalsOptedIn, setMarketSignalsOptedIn] = useState(props.marketSignalsOptedIn);
  const [maintenanceConsented, setMaintenanceConsented] = useState(props.maintenanceConsented);
  const [connectedAccountsOptedIn, setConnectedAccountsOptedIn] = useState(
    props.connectedAccountsOptedIn,
  );
  const [agentAccessOptedIn, setAgentAccessOptedIn] = useState(props.agentAccessOptedIn);
  const [profilePaused, setProfilePaused] = useState(props.profilePaused);
  const [notifyNewMatches, setNotifyNewMatches] = useState(props.notifyNewMatches);
  const [notifyRevealActivity, setNotifyRevealActivity] = useState(props.notifyRevealActivity);
  const [notifyProductUpdates, setNotifyProductUpdates] = useState(props.notifyProductUpdates);
  const [status, setStatus] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [resumeDeleted, setResumeDeleted] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const core = CONSENT_REGISTRY.find((e) => e.key === "core")!;
  const marketSignals = CONSENT_REGISTRY.find((e) => e.key === "market_signals")!;
  const maintenance = CONSENT_REGISTRY.find((e) => e.key === "maintenance")!;
  const connectedAccounts = CONSENT_REGISTRY.find((e) => e.key === "connected_accounts")!;
  const agentAccess = CONSENT_REGISTRY.find((e) => e.key === "agent_access")!;

  async function downloadExport() {
    setExportError(null);
    startTransition(async () => {
      try {
        const json = await exportMyData();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "binding-data-export.json";
        a.click();
        URL.revokeObjectURL(url);
        setStatus("Export downloaded.");
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "export failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="jb-lift" data-testid="consent-center">
        <CardHeader>
          <CardTitle className="text-sm">Consent center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          {status && <p className="text-sm text-muted-foreground">{status}</p>}

          {/* Core bundle: required at onboarding, not independently withdrawable —
              shown as a read-only summary row, not a toggle. */}
          <div data-testid="core-consent-row" className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{core.label}</span>
              <Badge variant="secondary">Required</Badge>
            </div>
            <p className="text-[13px] leading-normal text-muted-foreground">{core.description}</p>
            <p className="text-xs text-muted-foreground">
              Version {core.version} — accepted {formatDate(props.coreConsentAcceptedAt)}
            </p>
          </div>

          <Separator />

          <div data-testid="maintenance-consent-card" className="space-y-2">
            <ToggleRow
              testId="maintenance-consent"
              label={maintenance.label}
              description={maintenance.description}
              checked={maintenanceConsented}
              disabled={pending}
              onToggle={() => {
                const next = !maintenanceConsented;
                setMaintenanceConsented(next);
                startTransition(() => updateMaintenanceConsent(next));
              }}
            />
            <div className="flex items-center gap-2.5">
              <Badge variant={maintenanceConsented ? "default" : "secondary"}>
                {maintenanceConsented ? "On" : "Off"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Version {maintenance.version} — accepted {formatDate(props.maintenanceAcceptedAt)}
              </span>
            </div>
          </div>

          <Separator />

          <div data-testid="market-insights-consent-card" className="space-y-2">
            <ToggleRow
              testId="market-insights"
              label={marketSignals.label}
              description={marketSignals.description}
              checked={marketSignalsOptedIn}
              disabled={pending}
              onToggle={() => {
                const next = !marketSignalsOptedIn;
                setMarketSignalsOptedIn(next);
                startTransition(() => updateMarketSignalsConsent(next));
              }}
            />
            <div className="flex items-center gap-2.5">
              <Badge variant={marketSignalsOptedIn ? "default" : "secondary"}>
                {marketSignalsOptedIn ? "On" : "Off"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Version {marketSignals.version} — accepted {formatDate(props.marketSignalsAcceptedAt)}
              </span>
            </div>
          </div>

          <Separator />

          <div data-testid="agent-access-consent-card" className="space-y-2">
            <ToggleRow
              testId="agent-access"
              label={agentAccess.label}
              description={agentAccess.description}
              checked={agentAccessOptedIn}
              disabled={pending}
              onToggle={() => {
                const next = !agentAccessOptedIn;
                setAgentAccessOptedIn(next);
                startTransition(() => updateAgentAccessConsent(next));
              }}
            />
            <div className="flex items-center gap-2.5">
              <Badge variant={agentAccessOptedIn ? "default" : "secondary"}>
                {agentAccessOptedIn ? "On" : "Off"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Version {agentAccess.version} — accepted {formatDate(props.agentAccessAcceptedAt)}
              </span>
            </div>
            {!agentAccessOptedIn && (
              <p className="text-xs text-muted-foreground">
                Turning this off immediately disables every agent token you&apos;ve already issued —
                manage tokens from{" "}
                <a href="/seeker/settings/security" className="underline">
                  Security settings
                </a>
                .
              </p>
            )}
          </div>

          <Separator />

          <div data-testid="connected-accounts-consent-card" className="space-y-2">
            <ToggleRow
              testId="connected-accounts"
              label={connectedAccounts.label}
              description={connectedAccounts.description}
              checked={connectedAccountsOptedIn}
              disabled={pending}
              onToggle={() => {
                const next = !connectedAccountsOptedIn;
                setConnectedAccountsOptedIn(next);
                startTransition(() => updateConnectedAccountsConsent(next));
              }}
            />
            <div className="flex items-center gap-2.5">
              <Badge variant={connectedAccountsOptedIn ? "default" : "secondary"}>
                {connectedAccountsOptedIn ? "On" : "Off"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Version {connectedAccounts.version} — accepted{" "}
                {formatDate(props.connectedAccountsAcceptedAt)}
              </span>
              {props.driveConnected ? (
                <Badge variant="outline" data-testid="drive-connected-badge">
                  Google Drive connected
                </Badge>
              ) : (
                connectedAccountsOptedIn && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="connect-google-drive"
                    render={<a href="/api/connected-accounts/google-drive/authorize" />}
                  >
                    Connect Google Drive
                  </Button>
                )
              )}
            </div>
          </div>

          <Separator />

          {/* consent_flags.reveal_override_enabled and contact_sharing_consent
              have NO version column — unlike the 4 entries above, they are NOT
              in CONSENT_REGISTRY. Rendered as two explicitly un-versioned rows
              per the founder's review note, rather than silently omitted or
              force-fit into the registry's versioned shape. */}
          <div data-testid="override-consent-card" className="space-y-2">
            <ToggleRow
              testId="override-consent"
              label="Paid reveal-override"
              description="Recruiters can reveal your name pre-opt-in for a premium; you earn points and can decline. This consent has no version history — it's a plain on/off, not part of the versioned consent bundle above."
              checked={overrideEnabled}
              disabled={pending}
              onToggle={() => {
                const next = !overrideEnabled;
                setOverrideEnabled(next);
                startTransition(() => updateOverrideEnabled(next));
              }}
            />
            <Badge variant="outline" data-testid="override-consent-unversioned-label">
              Not versioned
            </Badge>
          </div>

          <Separator />

          <div data-testid="contact-sharing-consent-card" className="space-y-2">
            <ToggleRow
              testId="contact-sharing-consent"
              label="Contact-sharing consent"
              description="A separate, unversioned flag reserved for future features that would share your contact details directly (distinct from the identity disclosure a reveal already covers). Off by default."
              checked={contactSharingConsent}
              disabled={pending}
              onToggle={() => {
                const next = !contactSharingConsent;
                setContactSharingConsent(next);
                startTransition(() => updateContactSharingConsent(next));
              }}
            />
            <Badge variant="outline" data-testid="contact-sharing-consent-unversioned-label">
              Not versioned
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">Pause profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleRow
            testId="pause-profile"
            label="Pause my profile"
            description="Temporarily stop appearing in new matches and reveals without deleting any data — a softer option than deleting your account while you're not actively looking."
            checked={profilePaused}
            disabled={pending}
            onToggle={() => {
              const next = !profilePaused;
              setProfilePaused(next);
              startTransition(() => updateProfileVisibility(next));
            }}
          />
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">Notification preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <p className="text-xs text-muted-foreground">
            Transactional notifications (new matches, reveal activity) are kept separate from
            marketing communications — opting out of product updates never silences the other two.
            No email/push delivery is wired up yet; these are the preferences a future notifier will
            read.
          </p>
          <ToggleRow
            testId="notify-new-matches"
            label="New match alerts"
            description="Transactional — let us notify you when a new job match is surfaced."
            checked={notifyNewMatches}
            disabled={pending}
            onToggle={() => {
              const next = !notifyNewMatches;
              setNotifyNewMatches(next);
              startTransition(() => updateNotificationPreference("notifyNewMatches", next));
            }}
          />
          <ToggleRow
            testId="notify-reveal-activity"
            label="Reveal activity alerts"
            description="Transactional — let us notify you when a recruiter reveals or override-reveals your profile."
            checked={notifyRevealActivity}
            disabled={pending}
            onToggle={() => {
              const next = !notifyRevealActivity;
              setNotifyRevealActivity(next);
              startTransition(() => updateNotificationPreference("notifyRevealActivity", next));
            }}
          />
          <ToggleRow
            testId="notify-product-updates"
            label="Product updates (marketing)"
            description="Marketing — occasional news about new Binding features. Off by default."
            checked={notifyProductUpdates}
            disabled={pending}
            onToggle={() => {
              const next = !notifyProductUpdates;
              setNotifyProductUpdates(next);
              startTransition(() => updateNotificationPreference("notifyProductUpdates", next));
            }}
          />
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">Self-service data export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <p className="text-xs text-muted-foreground">
            Download a copy of your profile, résumé, matches, and points history as JSON.
            Rate-limited to once every 30 days.
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="dsar-export-button"
            disabled={pending || !props.dsarAvailable}
            onClick={downloadExport}
          >
            Download my data
          </Button>
          {!props.dsarAvailable && props.dsarNextAvailableAt && (
            <p className="text-xs text-muted-foreground" data-testid="dsar-rate-limit-message">
              Next export available {formatDate(props.dsarNextAvailableAt)}.
            </p>
          )}
          {exportError && (
            <p className="text-xs text-destructive" data-testid="dsar-export-error">
              {exportError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="jb-lift ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-sm text-destructive">Delete original resume</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <p className="text-xs text-muted-foreground">
            Permanently deletes your uploaded original résumé file and its stored text — distinct
            from full account deletion. This is a real, immediate delete, and if you&apos;ve enabled
            resume encryption it also destroys your encryption key (crypto-shredding), so even a
            leftover backup copy could never be decrypted; it cannot be undone. It does NOT remove
            your already-published redacted profile or existing matches — recruiters can still see
            and match against those. Use Pause profile above to stop new matching, or account
            deletion for a full removal.
          </p>
          {resumeDeleted || !props.hasOriginalResume ? (
            <Badge variant="secondary" data-testid="resume-deleted-badge">
              No original résumé on file
            </Badge>
          ) : deleteConfirming ? (
            <div className="flex items-center gap-2.5">
              <Button
                variant="destructive"
                size="sm"
                data-testid="confirm-delete-resume"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteOriginalResume();
                    setResumeDeleted(true);
                    setDeleteConfirming(false);
                  })
                }
              >
                Yes, permanently delete it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              data-testid="delete-original-resume"
              onClick={() => setDeleteConfirming(true)}
            >
              Delete my original resume now
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
