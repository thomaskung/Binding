"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@jumponboard/ui";
import {
  availableModesFor,
  fieldMode,
  filterFieldsForSurface,
  type FieldVisibilityMap,
  type FieldVisibilityMode,
  type ProfileFieldKey,
} from "@/lib/field-visibility";
import { regionFromLocation } from "@/lib/profile";
import {
  saveDraft,
  saveExperience,
  updateFieldVisibility,
  updateMarketSignalsConsent,
  updateSettings,
} from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

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

export interface ProfileFieldsProps {
  displayName: string;
  email: string;
  draftText: string;
  publishedText: string | null;
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

function datesLabel(start: string, end: string | null): string {
  const year = (d: string) => new Date(d).getFullYear();
  if (!start) return "";
  return `${year(start)} – ${end ? year(end) : "Present"}`;
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

/** Structured profile page (SeekerProfile template): Internal/External view
 * tabs + a global view/edit mode. External is the recruiter-facing redacted
 * derivation (region-only location, salary per consent, per-field
 * visibility, gated resume). Legal/privacy controls the template omits —
 * per-field visibility, market-insights opt-in, profile visibility, the
 * reveal-override toggle — live in the Privacy card (never dropped by the
 * redesign, per the founder's standing rule). */
export function ProfileFields(props: ProfileFieldsProps) {
  const [viewMode, setViewMode] = useState<"internal" | "external">("internal");
  const [editing, setEditing] = useState(false);

  const [displayName, setDisplayName] = useState(props.displayName);
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
  const [fieldVisibility, setFieldVisibility] = useState<FieldVisibilityMap>(
    props.fieldVisibility ?? {},
  );
  const [marketSignalsOptedIn, setMarketSignalsOptedIn] = useState(props.marketSignalsOptedIn);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const internal = viewMode === "internal";

  function setVisibility(key: ProfileFieldKey, mode: FieldVisibilityMode) {
    const next = { ...fieldVisibility, [key]: mode };
    setFieldVisibility(next);
    setStatus(null);
    startTransition(async () => {
      await updateFieldVisibility(next);
      // Post-await so "Visibility updated." only shows once the write has
      // actually committed — tests (and users) can rely on it as a settle
      // signal before publishing.
      setStatus("Visibility updated.");
    });
  }

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("draft_text", props.draftText);
      fd.set("display_name", displayName);
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
      await saveDraft(fd);
      await saveExperience(experience);
      setStatus("Profile fields saved.");
      setEditing(false);
    });
  }

  const skillsList = skillsText.split(",").map((s) => s.trim()).filter(Boolean);
  const desiredRolesList = desiredRolesText.split(",").map((s) => s.trim()).filter(Boolean);
  const industriesList = industriesText.split(",").map((s) => s.trim()).filter(Boolean);

  // External view derives through the same per-field visibility filter the
  // publish path uses — hidden/matching_only choices apply immediately here.
  const external = filterFieldsForSurface(
    {
      skills: skillsList,
      desiredRoles: desiredRolesList,
      industries: industriesList,
      referencesAvailable,
    },
    fieldVisibility,
    "display",
  );
  const headlineShown = fieldMode(fieldVisibility, "headline") === "visible";
  const locationShown = fieldMode(fieldVisibility, "location") === "visible";

  const shownSkills = internal ? skillsList : external.skills;
  const shownRoles = internal ? desiredRolesList : external.desiredRoles;
  const shownIndustries = internal ? industriesList : external.industries;
  const shownHeadline = internal ? headline : headlineShown ? headline : "";
  const shownLocation = internal
    ? location
    : locationShown && location
      ? regionFromLocation(location)
      : "";
  const salaryShown = internal || (shareSalary && minSalary);

  return (
    <main className="mx-auto max-w-[920px] space-y-6 px-6 py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Your profile</h1>
          <p className="text-[15px] text-muted-foreground">
            {internal
              ? "How your profile looks to you"
              : "How recruiters see you when a match is revealed"}
          </p>
        </div>
        {internal && (
          <div className="flex items-center gap-2.5">
            {editing ? (
              <>
                <Button variant="outline" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button disabled={pending} onClick={save}>
                  Save changes
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            )}
          </div>
        )}
      </header>

      <Tabs
        value={viewMode}
        onValueChange={(v) => {
          setViewMode(v as "internal" | "external");
          setEditing(false);
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="internal">Internal view</TabsTrigger>
          <TabsTrigger value="external">External view</TabsTrigger>
        </TabsList>
      </Tabs>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-[76px] items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground">
                  {initialsOf(displayName)}
                </div>
                {!editing && (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-lg font-semibold tracking-tight">{displayName}</div>
                    <div className="text-sm text-muted-foreground">{shownHeadline || "—"}</div>
                    <div className="text-[13px] text-muted-foreground">{shownLocation || "—"}</div>
                  </div>
                )}
              </div>
              {editing && (
                <div className="mt-3.5 flex flex-col gap-2.5 text-left">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="display_name">Full name</Label>
                    <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="headline">Headline</Label>
                    <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Senior Backend Engineer" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="location">Location (full address, internal only)</Label>
                    <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
                  </div>
                </div>
              )}
              <Separator className="my-3.5" />
              {internal ? (
                editing ? (
                  <div className="flex flex-col gap-2.5 text-left">
                    <div className="space-y-1">
                      <Label className="text-xs">Email (never shown to recruiters)</Label>
                      <Input value={props.email} disabled />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="phone">Phone (never shown to recruiters)</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-[13px]">{props.email}</span>
                    <span className="text-[13px] text-muted-foreground">{phone || "—"}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      Visible to you only. Never shared with recruiters.
                    </span>
                  </div>
                )
              ) : (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm">
                    Message via platform
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Resume</CardTitle>
            </CardHeader>
            <CardContent>
              {internal ? (
                <div className="flex flex-col gap-2.5">
                  <span className="text-[13px] text-muted-foreground">
                    {props.publishedText
                      ? "Published — your redacted profile is live in the pool."
                      : props.draftText
                        ? "Draft saved — not yet published."
                        : "No resume yet."}
                  </span>
                  <Button
                    variant={props.draftText ? "outline" : "default"}
                    size="sm"
                    render={<Link href="/seeker/profile/resume" />}
                  >
                    Open resume editor
                  </Button>
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">
                  Available after this match is revealed.
                </span>
              )}
            </CardContent>
          </Card>

          {internal && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Points balance</CardTitle>
                <CardAction>
                  <Badge variant="secondary">{props.pointsBalance.toLocaleString()} points</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.pointsHistory.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium">{row.delta}</span>
                  </div>
                ))}
                <Button variant="ghost" size="sm" render={<Link href="/seeker/points" />}>
                  Full history →
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Salary &amp; availability</CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    {salaryShown && minSalary ? (
                      <>
                        <span className="text-lg font-semibold tracking-tight">
                          ${Number(minSalary).toLocaleString()}+
                        </span>
                        <span className="text-xs text-muted-foreground">Expected base salary</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Salary expectations hidden by candidate
                      </span>
                    )}
                  </div>
                  <Badge variant="outline">
                    {props.visibility === "active" ? "Actively looking" : "Not looking"}
                  </Badge>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="min_salary">Minimum base salary (USD)</Label>
                    <Input
                      id="min_salary"
                      type="number"
                      value={minSalary}
                      onChange={(e) => setMinSalary(e.target.value)}
                      placeholder="e.g. 90000"
                    />
                  </div>
                  <p className="self-end text-xs text-muted-foreground">
                    Availability is set in the Privacy card below.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="flex flex-wrap gap-2">
                  {shownSkills.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {internal ? "No skills yet." : "Hidden by candidate."}
                    </span>
                  )}
                  {shownSkills.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="skills">Comma-separated</Label>
                  <Textarea
                    id="skills"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Work experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {internal ? (
                !editing ? (
                  <>
                    {experience.length === 0 && (
                      <span className="text-sm text-muted-foreground">No entries yet.</span>
                    )}
                    {experience.map((job, i) => (
                      <div key={job.id ?? i} className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">{job.role || "—"}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {job.company}
                          {job.startDate ? ` · ${datesLabel(job.startDate, job.endDate)}` : ""}
                        </span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {experience.map((job, i) => (
                      <div key={job.id ?? i} className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2">
                        <Input
                          aria-label="Role"
                          value={job.role}
                          onChange={(e) =>
                            setExperience((rows) =>
                              rows.map((r, idx) => (idx === i ? { ...r, role: e.target.value } : r)),
                            )
                          }
                          placeholder="Role"
                        />
                        <Input
                          aria-label="Company"
                          value={job.company}
                          onChange={(e) =>
                            setExperience((rows) =>
                              rows.map((r, idx) => (idx === i ? { ...r, company: e.target.value } : r)),
                            )
                          }
                          placeholder="Company"
                        />
                        <Input
                          aria-label="Start date"
                          type="date"
                          value={job.startDate}
                          onChange={(e) =>
                            setExperience((rows) =>
                              rows.map((r, idx) => (idx === i ? { ...r, startDate: e.target.value } : r)),
                            )
                          }
                        />
                        <Input
                          aria-label="End date"
                          type="date"
                          value={job.endDate ?? ""}
                          onChange={(e) =>
                            setExperience((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, endDate: e.target.value || null } : r,
                              ),
                            )
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExperience((rows) => rows.filter((_, idx) => idx !== i))}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExperience((rows) => [
                          ...rows,
                          { role: "", company: "", industry: null, startDate: "", endDate: null },
                        ])
                      }
                    >
                      Add role
                    </Button>
                  </>
                )
              ) : (
                <span className="text-sm text-muted-foreground">
                  Recruiters never see raw work-history entries — only aggregate signals derived
                  from them.
                </span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Desired roles</p>
                {!editing ? (
                  <div className="flex flex-wrap gap-2">
                    {shownRoles.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        {internal ? "None yet." : "Hidden by candidate."}
                      </span>
                    )}
                    {shownRoles.map((r) => (
                      <Badge key={r} variant="outline">
                        {r}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Input
                    id="desired_roles"
                    value={desiredRolesText}
                    onChange={(e) => setDesiredRolesText(e.target.value)}
                    placeholder="Backend Engineer, Staff Engineer"
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Remote preference</span>
                {!editing ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {workSetups.length === 0 && <Badge variant="outline">—</Badge>}
                    {workSetups.map((s) => (
                      <Badge key={s} variant="outline" className="capitalize">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {WORK_SETUPS.map((setup) => (
                      <label key={setup} className="flex items-center gap-1 text-sm capitalize">
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
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Industries</p>
                {!editing ? (
                  <div className="flex flex-wrap gap-2">
                    {shownIndustries.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        {internal ? "None yet." : "Hidden by candidate."}
                      </span>
                    )}
                    {shownIndustries.map((ind) => (
                      <Badge key={ind} variant="outline">
                        {ind}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Input
                    id="industries"
                    value={industriesText}
                    onChange={(e) => setIndustriesText(e.target.value)}
                    placeholder="Fintech, Developer Tools"
                  />
                )}
              </div>

              {internal && !editing && external.referencesAvailable && (
                <p className="text-xs text-muted-foreground">References available on request.</p>
              )}
              {internal && editing && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={referencesAvailable}
                    onChange={(e) => setReferencesAvailable(e.target.checked)}
                  />
                  References available on request
                </label>
              )}

              {internal && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium">
                        Share salary expectations with recruiters
                      </span>
                      <span className="text-xs text-muted-foreground">
                        When off, recruiters see your role only — not your salary range
                      </span>
                    </div>
                    <Button
                      variant={shareSalary ? "default" : "outline"}
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const next = !shareSalary;
                        setShareSalary(next);
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("draft_text", props.draftText);
                          fd.set("display_name", displayName);
                          fd.set("headline", headline);
                          fd.set("phone", phone);
                          fd.set("location", location);
                          fd.set("skills", skillsText);
                          fd.set("desired_roles", desiredRolesText);
                          fd.set("industries", industriesText);
                          if (referencesAvailable) fd.set("references_available", "on");
                          if (next) fd.set("share_salary", "on");
                          if (minSalary) fd.set("min_salary", minSalary);
                          workSetups.forEach((s) => fd.append("work_setups", s));
                          await saveDraft(fd);
                        });
                      }}
                    >
                      {shareSalary ? "Shared" : "Hidden"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {internal && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Privacy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <VisibilityControl
                    fieldKey="headline"
                    label="Headline"
                    mode={fieldMode(fieldVisibility, "headline")}
                    onChange={(m) => setVisibility("headline", m)}
                  />
                  <VisibilityControl
                    fieldKey="location"
                    label="Location (region)"
                    mode={fieldMode(fieldVisibility, "location")}
                    onChange={(m) => setVisibility("location", m)}
                  />
                  <VisibilityControl
                    fieldKey="skills"
                    label="Skills"
                    mode={fieldMode(fieldVisibility, "skills")}
                    onChange={(m) => setVisibility("skills", m)}
                  />
                  <VisibilityControl
                    fieldKey="desired_roles"
                    label="Desired roles"
                    mode={fieldMode(fieldVisibility, "desired_roles")}
                    onChange={(m) => setVisibility("desired_roles", m)}
                  />
                  <VisibilityControl
                    fieldKey="industries"
                    label="Target industries"
                    mode={fieldMode(fieldVisibility, "industries")}
                    onChange={(m) => setVisibility("industries", m)}
                  />
                  <VisibilityControl
                    fieldKey="references_available"
                    label="References note"
                    mode={fieldMode(fieldVisibility, "references_available")}
                    onChange={(m) => setVisibility("references_available", m)}
                  />
                </div>

                <Separator />

                <form
                  action={(fd) =>
                    startTransition(async () => {
                      await updateSettings(fd);
                      setStatus("Settings saved.");
                    })
                  }
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="visibility" className="text-sm">
                      Profile visibility
                    </Label>
                    <select
                      id="visibility"
                      name="visibility"
                      defaultValue={props.visibility}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      <option value="active">Actively looking</option>
                      <option value="paused">Not looking</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="reveal_override_enabled"
                      defaultChecked={props.overrideEnabled}
                      className="mt-1"
                    />
                    <span>
                      Allow paid reveal-override{" "}
                      <span className="text-xs text-muted-foreground">
                        (recruiters can reveal your name pre-opt-in for a premium; you earn points
                        and can decline)
                      </span>
                    </span>
                  </label>
                  <Button type="submit" size="sm" variant="outline" disabled={pending}>
                    Save settings
                  </Button>
                </form>

                <Separator />

                <div data-testid="market-insights-consent-card" className="space-y-3.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">Anonymized market insights</span>
                    <span className="text-xs text-muted-foreground">
                      A separate, optional program — distinct from your AI-processing consent.
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">
                        Contribute to anonymized market insights
                      </span>
                      <span className="text-[13px] leading-normal text-muted-foreground">
                        We use only aggregated, non-identifiable data (never your name, resume, or
                        individual profile), and only when at least 20 similar people are in the
                        group — otherwise the signal is suppressed. You can opt out anytime.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={marketSignalsOptedIn}
                      aria-label="Contribute to anonymized market insights"
                      disabled={pending}
                      data-testid="market-insights-toggle"
                      onClick={() => {
                        const next = !marketSignalsOptedIn;
                        setMarketSignalsOptedIn(next);
                        startTransition(() => updateMarketSignalsConsent(next));
                      }}
                      className={
                        "relative h-6 w-10 flex-none rounded-full transition-colors " +
                        (marketSignalsOptedIn ? "bg-primary" : "bg-secondary")
                      }
                    >
                      <span
                        className={
                          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] " +
                          (marketSignalsOptedIn ? "left-[18px]" : "left-0.5")
                        }
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Badge variant={marketSignalsOptedIn ? "default" : "secondary"}>
                      {marketSignalsOptedIn ? "On" : "Off"}
                    </Badge>
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
                          <DialogTitle>What&apos;s shared, and what&apos;s never shared</DialogTitle>
                          <DialogDescription>
                            Only group-level signals leave your profile — never anything that
                            identifies you.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-5 text-sm">
                          <div>
                            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                              Shared
                            </p>
                            <ul className="flex flex-col gap-2">
                              <li>Aggregate skill demand</li>
                              <li>Salary-range trends by role and region</li>
                              <li>Demand and salary by seniority band (min-20 cohorts)</li>
                            </ul>
                          </div>
                          <div>
                            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                              Never shared
                            </p>
                            <ul className="flex flex-col gap-2">
                              <li>Your name</li>
                              <li>Your resume</li>
                              <li>Your current employer</li>
                              <li>Any contact details</li>
                              <li>Your individual profile or answers</li>
                            </ul>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
