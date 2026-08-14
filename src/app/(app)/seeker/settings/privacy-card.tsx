"use client";

import { useState, useTransition } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@binding/ui";
import {
  availableModesFor,
  fieldMode,
  type FieldVisibilityMap,
  type FieldVisibilityMode,
  type ProfileFieldKey,
} from "@/lib/field-visibility";
import { updateFieldVisibility } from "../actions";

/** Field-level visibility controls (DESIGN.md §13e: "Extract the card into a
 * shared component; the profile page keeps a link, not the controls").
 * Previously lived inline in src/app/(app)/seeker/profile/profile-fields.tsx's
 * "Privacy" card — moved here unchanged in behavior (same
 * updateFieldVisibility server action, same per-field cycling-pill UI) so
 * `/seeker/profile` can shrink to a link. Raw field values are read-only
 * labels here (this is a settings page, not an editor) — editing headline/
 * skills/etc. text still happens on /seeker/profile; only the visibility
 * MODE per field is controlled here. */

const PRIVACY_FIELD_KEYS: ProfileFieldKey[] = [
  "headline",
  "location",
  "skills",
  "desired_roles",
  "industries",
  "references_available",
  "credentials",
];
const PRIVACY_FIELD_COUNT = PRIVACY_FIELD_KEYS.length;

const MODE_LABEL: Record<FieldVisibilityMode, string> = {
  visible: "Visible",
  matching_only: "Matching only",
  hidden: "Hidden",
};

const MODE_HINT: Record<FieldVisibilityMode, string | null> = {
  visible: null,
  matching_only: "Hidden from recruiters — still used to match you to relevant jobs.",
  hidden: "Hidden from recruiters and excluded from matching.",
};

function VisibilityControl({
  fieldKey,
  label,
  rawValue,
  mode,
  onChange,
}: {
  fieldKey: ProfileFieldKey;
  label: string;
  rawValue: string;
  mode: FieldVisibilityMode;
  onChange: (mode: FieldVisibilityMode) => void;
}) {
  const modes = availableModesFor(fieldKey);
  const hint = MODE_HINT[mode];
  function cycleMode() {
    const nextMode = modes[(modes.indexOf(mode) + 1) % modes.length]!;
    onChange(nextMode);
  }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm">{rawValue || "—"}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          aria-label={`${label} visibility: ${MODE_LABEL[mode]}. Click to change.`}
          className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-secondary transition-colors"
          onClick={cycleMode}
        >
          {MODE_LABEL[mode]}
        </button>
        {hint && <span className="max-w-56 text-right text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export interface PrivacyCardProps {
  fieldVisibility: FieldVisibilityMap;
  headline: string;
  location: string;
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  referencesAvailable: boolean;
  credentials: string;
}

export function PrivacyCard(props: PrivacyCardProps) {
  const [fieldVisibility, setFieldVisibility] = useState<FieldVisibilityMap>(
    props.fieldVisibility ?? {},
  );
  const [status, setStatus] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setVisibility(key: ProfileFieldKey, mode: FieldVisibilityMode) {
    const next = { ...fieldVisibility, [key]: mode };
    setFieldVisibility(next);
    setStatus(null);
    startTransition(async () => {
      await updateFieldVisibility(next);
      // Post-await so "Visibility updated." only shows once the write has
      // actually committed — same settle-signal discipline the original
      // inline version of this card used (e2e/field-visibility.spec.ts
      // relies on it as a wait condition before reloading).
      setStatus("Visibility updated.");
    });
  }

  const visibleFieldCount = PRIVACY_FIELD_KEYS.filter(
    (k) => fieldMode(fieldVisibility, k) === "visible",
  ).length;

  return (
    <Card className="jb-lift">
      <CardHeader>
        <CardTitle className="text-sm">Field-level visibility</CardTitle>
        <CardAction>
          <span className="text-xs text-muted-foreground">
            {visibleFieldCount} of {PRIVACY_FIELD_COUNT} visible
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <p className="text-sm text-muted-foreground" data-testid="field-visibility-status">
            {status}
          </p>
        )}
        <div>
          <VisibilityControl
            fieldKey="headline"
            label="Headline"
            rawValue={props.headline}
            mode={fieldMode(fieldVisibility, "headline")}
            onChange={(m) => setVisibility("headline", m)}
          />
          <VisibilityControl
            fieldKey="location"
            label="Location (region)"
            rawValue={props.location}
            mode={fieldMode(fieldVisibility, "location")}
            onChange={(m) => setVisibility("location", m)}
          />
          <VisibilityControl
            fieldKey="skills"
            label="Skills"
            rawValue={props.skills.join(", ")}
            mode={fieldMode(fieldVisibility, "skills")}
            onChange={(m) => setVisibility("skills", m)}
          />
          <VisibilityControl
            fieldKey="desired_roles"
            label="Desired roles"
            rawValue={props.desiredRoles.join(", ")}
            mode={fieldMode(fieldVisibility, "desired_roles")}
            onChange={(m) => setVisibility("desired_roles", m)}
          />
          <VisibilityControl
            fieldKey="industries"
            label="Target industries"
            rawValue={props.industries.join(", ")}
            mode={fieldMode(fieldVisibility, "industries")}
            onChange={(m) => setVisibility("industries", m)}
          />
          <VisibilityControl
            fieldKey="references_available"
            label="References note"
            rawValue={props.referencesAvailable ? "Available on request" : "Not offered"}
            mode={fieldMode(fieldVisibility, "references_available")}
            onChange={(m) => setVisibility("references_available", m)}
          />
          <VisibilityControl
            fieldKey="credentials"
            label="Credentials"
            rawValue={props.credentials}
            mode={fieldMode(fieldVisibility, "credentials")}
            onChange={(m) => setVisibility("credentials", m)}
          />
        </div>

        <div className="flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none text-primary"
          >
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span>
            Name &amp; contact stay hidden until you accept a reveal — that rule can&apos;t be
            turned off.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
