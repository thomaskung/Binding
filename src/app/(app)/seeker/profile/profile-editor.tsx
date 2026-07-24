"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Label, Separator, Tabs, TabsList, TabsTrigger, Textarea } from "@jumponboard/ui";
import {
  availableModesFor,
  fieldMode,
  filterFieldsForSurface,
  type FieldVisibilityMap,
  type FieldVisibilityMode,
  type ProfileFieldKey,
} from "@/lib/field-visibility";
import { PROFILE_QUICK_ACTIONS, regionFromLocation } from "@/lib/profile";
import {
  publishProfile,
  refineProfileText,
  saveDraft,
  saveExperience,
  updateFieldVisibility,
  updateMarketSignalsConsent,
  updateSettings,
} from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;
const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote only",
  hybrid: "Hybrid",
  onsite: "On-site",
};

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

export interface ExperienceRow {
  id?: string;
  role: string;
  company: string;
  industry: string | null;
  startDate: string;
  endDate: string | null;
}

interface Props {
  displayName: string;
  draftText: string;
  publishedText: string | null;
  redactedText: string | null;
  visibility: "active" | "paused";
  overrideEnabled: boolean;
  marketSignalsOptedIn: boolean;
  minSalary: number | null;
  workSetups: string[];
  headline: string;
  phone: string;
  location: string;
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  referencesAvailable: boolean;
  shareSalary: boolean;
  fieldVisibility: FieldVisibilityMap;
  seekerTier: "free" | "pro";
  experience: ExperienceRow[];
  pointsBalance: number;
  pointsHistory: { label: string; delta: string }[];
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function VisibilityControl({
  fieldKey,
  label,
  mode,
  onChange,
}: {
  fieldKey: ProfileFieldKey;
  label: string;
  mode: FieldVisibilityMode;
  onChange: (mode: FieldVisibilityMode) => void;
}) {
  const modes = availableModesFor(fieldKey);
  const hint = MODE_HINT[mode];
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <div className="flex flex-col items-end gap-1">
        <select
          aria-label={`${label} visibility`}
          className="rounded-md border px-2 py-1 text-xs"
          value={mode}
          onChange={(e) => onChange(e.target.value as FieldVisibilityMode)}
        >
          {modes.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        {hint && <span className="max-w-56 text-right text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function ProfileEditor(props: Props) {
  const [view, setView] = useState<"canvas" | "profile">("canvas");

  const [draft, setDraft] = useState(props.draftText);
  const [headline, setHeadline] = useState(props.headline);
  const [phone, setPhone] = useState(props.phone);
  const [location, setLocation] = useState(props.location);
  const [skillsText, setSkillsText] = useState(props.skills.join(", "));
  const [desiredRolesText, setDesiredRolesText] = useState(props.desiredRoles.join(", "));
  const [industriesText, setIndustriesText] = useState(props.industries.join(", "));
  const [referencesAvailable, setReferencesAvailable] = useState(props.referencesAvailable);
  const [shareSalary, setShareSalary] = useState(props.shareSalary);
  const [minSalary, setMinSalary] = useState(props.minSalary?.toString() ?? "");
  const [workSetups, setWorkSetups] = useState<string[]>(props.workSetups);
  const [experience, setExperience] = useState<ExperienceRow[]>(props.experience);
  const [fieldVisibility, setFieldVisibility] = useState<FieldVisibilityMap>(props.fieldVisibility ?? {});

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [marketSignalsOptedIn, setMarketSignalsOptedIn] = useState(props.marketSignalsOptedIn);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadResume(file: File) {
    setStatus("Extracting text…");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/ingest", { method: "POST", body });
    if (!res.ok) {
      setStatus(`Upload failed: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return;
    }
    const { text } = (await res.json()) as { text: string };
    setDraft(text);
    setStatus("Resume text extracted — review below, then publish.");
  }

  function refine(instruction?: string) {
    startTransition(async () => {
      setStatus("Asking the AI for a refinement…");
      try {
        const refined = await refineProfileText(draft, instruction);
        setSuggestion(refined);
        setStatus(null);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Refinement failed.");
      }
    });
  }

  function setVisibility(key: ProfileFieldKey, mode: FieldVisibilityMode) {
    const next = { ...fieldVisibility, [key]: mode };
    setFieldVisibility(next);
    startTransition(() => updateFieldVisibility(next));
  }

  function buildProfileFormData() {
    const fd = new FormData();
    fd.set("draft_text", draft);
    fd.set("headline", headline);
    fd.set("phone", phone);
    fd.set("location", location);
    fd.set("skills", skillsText);
    fd.set("desired_roles", desiredRolesText);
    fd.set("industries", industriesText);
    if (referencesAvailable) fd.set("references_available", "on");
    if (shareSalary) fd.set("share_salary", "on");
    if (minSalary) fd.set("min_salary", minSalary);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  function addExperienceRow() {
    setExperience((rows) => [
      ...rows,
      { role: "", company: "", industry: null, startDate: "", endDate: null },
    ]);
  }

  function updateExperienceRow(i: number, patch: Partial<ExperienceRow>) {
    setExperience((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeExperienceRow(i: number) {
    setExperience((rows) => rows.filter((_, idx) => idx !== i));
  }

  function saveExperienceRows() {
    startTransition(async () => {
      await saveExperience(experience);
      setStatus("Work experience saved.");
    });
  }

  const skillsList = skillsText.split(",").map((s) => s.trim()).filter(Boolean);
  const desiredRolesList = desiredRolesText.split(",").map((s) => s.trim()).filter(Boolean);
  const industriesList = industriesText.split(",").map((s) => s.trim()).filter(Boolean);
  const remotePref = workSetups.includes("remote")
    ? "remote"
    : workSetups.includes("hybrid")
      ? "hybrid"
      : workSetups.includes("onsite")
        ? "onsite"
        : null;

  // "Recruiter sees now" mirror (Profile tab): same live-from-client-state
  // derivation the old External view used, now filtered through per-field
  // visibility — a seeker's hidden/matching_only choices show up here
  // immediately, before the next Publish.
  const mirrorFields = filterFieldsForSurface(
    { skills: skillsList, desiredRoles: desiredRolesList, industries: industriesList, referencesAvailable },
    fieldVisibility,
    "display",
  );
  const headlineShown = fieldMode(fieldVisibility, "headline") === "visible";
  const locationShown = fieldMode(fieldVisibility, "location") === "visible";

  const recruiterMirror = (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-19 w-19 items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground">
            {initialsOf(props.displayName)}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-lg font-semibold tracking-tight">{props.displayName}</div>
            <div className="text-sm text-muted-foreground">{headlineShown ? headline || "—" : "—"}</div>
            <div className="text-xs text-muted-foreground">
              {locationShown && location ? regionFromLocation(location) : "—"}
            </div>
          </div>
          <Button variant="outline" size="sm">
            Message via platform
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Salary &amp; availability</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            {shareSalary && minSalary ? (
              <>
                <span className="text-lg font-semibold tracking-tight">
                  ${Number(minSalary).toLocaleString()}+
                </span>
                <span className="text-xs text-muted-foreground">Expected base salary</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Salary expectations hidden by candidate</span>
            )}
          </div>
          <Badge variant="outline">{props.visibility === "active" ? "Actively looking" : "Not looking"}</Badge>
        </CardContent>
      </Card>

      {mirrorFields.skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Skills</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {mirrorFields.skills.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mirrorFields.desiredRoles.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Desired roles</p>
              <div className="flex flex-wrap gap-2">
                {mirrorFields.desiredRoles.map((r) => (
                  <Badge key={r} variant="outline">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {remotePref && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Remote preference</span>
              <Badge variant="outline">{REMOTE_LABEL[remotePref]}</Badge>
            </div>
          )}
          {mirrorFields.industries.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Industries</p>
              <div className="flex flex-wrap gap-2">
                {mirrorFields.industries.map((i) => (
                  <Badge key={i} variant="outline">
                    {i}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-medium tracking-tight">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            {view === "canvas"
              ? "Write and refine the resume text that gets redacted, embedded, and matched."
              : "Your details, privacy controls, and a live preview of what recruiters see."}
          </p>
        </div>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as "canvas" | "profile")}>
        <TabsList variant="line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="canvas">Résumé canvas</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "canvas" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Résumé canvas</CardTitle>
              <CardDescription>
                Edits are drafts until you publish. Publishing re-runs
                redact → embed → match (one AI pass per publish).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadResume(f);
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  Upload resume PDF
                </Button>
                {PROFILE_QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.key}
                    variant="outline"
                    size="sm"
                    disabled={pending || !draft.trim()}
                    onClick={() => refine(action.instruction)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>

              {props.seekerTier === "pro" && (
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <Badge variant="outline" className="flex-none">
                    Pro
                  </Badge>
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask the AI to rewrite something specific…"
                    className="border-none shadow-none"
                  />
                  <Button
                    size="sm"
                    disabled={pending || !draft.trim() || !chatInput.trim()}
                    onClick={() => {
                      refine(chatInput.trim());
                      setChatInput("");
                    }}
                  >
                    Ask AI
                  </Button>
                </div>
              )}

              <Textarea
                data-testid="profile-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={10}
                placeholder="Paste or write your professional profile — skills, experience, achievements. Leave out your name; we redact anyway."
              />

              {suggestion !== null && (
                <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Current</p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{draft}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">AI suggestion</p>
                    <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setDraft(suggestion);
                          setSuggestion(null);
                        }}
                      >
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await saveDraft(buildProfileFormData());
                      setStatus("Draft saved.");
                    });
                  }}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  data-testid="publish-profile"
                  disabled={pending || !draft.trim()}
                  onClick={() => {
                    startTransition(async () => {
                      await saveDraft(buildProfileFormData());
                      await publishProfile();
                      setStatus("Published — your redacted profile is live in the pool.");
                    });
                  }}
                >
                  Publish to pool
                </Button>
              </div>
              {status && <p className="text-sm text-muted-foreground">{status}</p>}
            </CardContent>
          </Card>

          {props.redactedText && (
            <Card>
              <CardHeader>
                <CardTitle>What recruiters see</CardTitle>
                <CardDescription>
                  Your live redacted profile, including the derived signals below (never the raw
                  work-history entries). Pseudonymized — but treat redaction as risk reduction, not
                  a guarantee.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap" data-testid="redacted-preview">
                  {props.redactedText}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Basics</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <VisibilityControl
                    fieldKey="headline"
                    label="Headline"
                    mode={fieldMode(fieldVisibility, "headline")}
                    onChange={(m) => setVisibility("headline", m)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headline">Headline</Label>
                  <Input
                    id="headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Senior Backend Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (never shown to recruiters)</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <VisibilityControl
                    fieldKey="location"
                    label="Location (region shown to recruiters)"
                    mode={fieldMode(fieldVisibility, "location")}
                    onChange={(m) => setVisibility("location", m)}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="location">Location (full address, internal only)</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="512 Elm St, Austin, TX 78701"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Skills &amp; preferences</CardTitle>
                <CardDescription>
                  Feeds matching alongside your profile text. Each field&apos;s visibility takes
                  effect next time you publish.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <VisibilityControl
                    fieldKey="skills"
                    label="Skills"
                    mode={fieldMode(fieldVisibility, "skills")}
                    onChange={(m) => setVisibility("skills", m)}
                  />
                  <Textarea
                    id="skills"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    placeholder="Node.js, PostgreSQL, AWS, System Design"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <VisibilityControl
                    fieldKey="desired_roles"
                    label="Desired roles"
                    mode={fieldMode(fieldVisibility, "desired_roles")}
                    onChange={(m) => setVisibility("desired_roles", m)}
                  />
                  <Input
                    id="desired_roles"
                    value={desiredRolesText}
                    onChange={(e) => setDesiredRolesText(e.target.value)}
                    placeholder="Backend Engineer, Staff Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <VisibilityControl
                    fieldKey="industries"
                    label="Target industries"
                    mode={fieldMode(fieldVisibility, "industries")}
                    onChange={(m) => setVisibility("industries", m)}
                  />
                  <Input
                    id="industries"
                    value={industriesText}
                    onChange={(e) => setIndustriesText(e.target.value)}
                    placeholder="Fintech, Developer Tools, Healthtech"
                  />
                </div>
                <VisibilityControl
                  fieldKey="references_available"
                  label="References available"
                  mode={fieldMode(fieldVisibility, "references_available")}
                  onChange={(m) => setVisibility("references_available", m)}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">I have references available</p>
                    <p className="text-xs text-muted-foreground">
                      The underlying fact — the visibility control above governs whether it&apos;s
                      shown to recruiters/matching at all.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={referencesAvailable}
                    onChange={(e) => setReferencesAvailable(e.target.checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Minimum base salary (dealbreaker)</p>
                    <p className="text-xs text-muted-foreground">
                      Off = recruiters see your role only, not your salary range.
                    </p>
                  </div>
                  <Button
                    variant={shareSalary ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShareSalary((v) => !v)}
                  >
                    {shareSalary ? "Shared" : "Hidden"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min_salary">Minimum base salary (USD)</Label>
                    <Input
                      id="min_salary"
                      type="number"
                      value={minSalary}
                      onChange={(e) => setMinSalary(e.target.value)}
                      placeholder="e.g. 90000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Acceptable work setups</Label>
                    <div className="flex gap-4 pt-2">
                      {WORK_SETUPS.map((setup) => (
                        <label key={setup} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={workSetups.includes(setup)}
                            onChange={(e) =>
                              setWorkSetups((prev) =>
                                e.target.checked ? [...prev, setup] : prev.filter((s) => s !== setup),
                              )
                            }
                          />
                          {setup}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      await saveDraft(buildProfileFormData());
                      setStatus("Profile fields saved.");
                    });
                  }}
                >
                  Save fields
                </Button>
                {status && <p className="text-sm text-muted-foreground">{status}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Work experience</CardTitle>
                <CardDescription>
                  Kept private — only aggregate signals (years of experience, tenure, industry) reach
                  recruiters, never these raw entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {experience.map((row, i) => (
                  <div key={row.id ?? i} className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Role</Label>
                      <Input
                        value={row.role}
                        onChange={(e) => updateExperienceRow(i, { role: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Company</Label>
                      <Input
                        value={row.company}
                        onChange={(e) => updateExperienceRow(i, { company: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Industry</Label>
                      <Input
                        value={row.industry ?? ""}
                        onChange={(e) => updateExperienceRow(i, { industry: e.target.value || null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="date"
                        value={row.startDate}
                        onChange={(e) => updateExperienceRow(i, { startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End (blank = present)</Label>
                      <Input
                        type="date"
                        value={row.endDate ?? ""}
                        onChange={(e) => updateExperienceRow(i, { endDate: e.target.value || null })}
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeExperienceRow(i)}>
                      Remove
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={addExperienceRow}>
                    Add role
                  </Button>
                  <Button size="sm" disabled={pending} onClick={saveExperienceRows}>
                    Save work experience
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Points balance</CardTitle>
                <CardAction>
                  <Badge variant="secondary">{props.pointsBalance} pts</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.pointsHistory.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">{row.delta}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Privacy settings</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateSettings} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Profile visibility</p>
                      <p className="text-sm text-muted-foreground">
                        Paused = no new matches; existing conversations stay open.
                      </p>
                    </div>
                    <select
                      name="visibility"
                      defaultValue={props.visibility}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Allow paid reveal-override</p>
                      <p className="text-sm text-muted-foreground">
                        Off = nobody can reveal you before you express interest, at
                        any price. On = recruiters can pay extra to reveal early and
                        you earn points either way.{" "}
                        <Badge variant="outline">override flow ships post-MVP</Badge>
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      name="reveal_override_enabled"
                      defaultChecked={props.overrideEnabled}
                    />
                  </div>
                  <Button type="submit" variant="outline">
                    Save settings
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card data-testid="market-insights-consent-card">
              <CardHeader>
                <CardTitle>Market insights</CardTitle>
                <CardDescription>
                  A separate, independent consent from AI-processing consent above — you can turn
                  this on or off any time without affecting your matching profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Contribute to anonymized market insights</p>
                    <p className="text-sm text-muted-foreground">
                      We use only aggregated, non-identifiable data (never your name, resume, or
                      individual profile), and only when at least 20 similar people are in the
                      group — otherwise the signal is suppressed. You can opt out anytime.
                    </p>
                  </div>
                  <Button
                    data-testid="market-insights-toggle"
                    variant={marketSignalsOptedIn ? "default" : "outline"}
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const next = !marketSignalsOptedIn;
                      startTransition(async () => {
                        await updateMarketSignalsConsent(next);
                        setMarketSignalsOptedIn(next);
                      });
                    }}
                  >
                    {marketSignalsOptedIn ? "Contributing" : "Not contributing"}
                  </Button>
                </div>
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button variant="ghost" size="sm" data-testid="market-insights-learn-more" />
                    }
                  >
                    Learn what&apos;s shared / not shared
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>What market insights uses</DialogTitle>
                      <DialogDescription>
                        Only aggregate signals over cohorts of at least 20 people — never an
                        individual profile.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="mb-2 font-medium">Shared</p>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          <li>Aggregate skill demand</li>
                          <li>Aggregate salary-range trends</li>
                          <li>Aggregate demand and salary trends broken down by region and seniority band (same min-20 threshold)</li>
                        </ul>
                      </div>
                      <div>
                        <Separator className="mb-2 md:hidden" />
                        <p className="mb-2 font-medium">Never shared</p>
                        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                          <li>Your name</li>
                          <li>Your resume</li>
                          <li>Your employer</li>
                          <li>Your contact details</li>
                          <li>Your individual profile</li>
                        </ul>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>

          <div className="lg:sticky lg:top-8">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recruiter sees now</p>
            {recruiterMirror}
          </div>
        </div>
      )}
    </main>
  );
}
