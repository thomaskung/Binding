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
  Input,
  Label,
  Separator,
  Textarea,
} from "@binding/ui";
import { fieldMode, filterFieldsForSurface, type FieldVisibilityMap } from "@/lib/field-visibility";
import { regionFromLocation } from "@/lib/profile";
import { saveDraft, saveExperience } from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

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
  seekerTier?: "free" | "pro";
  draftText: string;
  publishedText: string | null;
  /** Read-only display here (badges only) — the editable "Pause profile"
   * control lives on /seeker/settings/privacy now (DESIGN.md §13e). */
  visibility: "active" | "paused";
  minSalary: number | null;
  workSetups: string[];
  equityRequired: boolean;
  headline: string;
  phone: string;
  location: string;
  skills: string[];
  desiredRoles: string[];
  industries: string[];
  referencesAvailable: boolean;
  shareSalary: boolean;
  credentials: string;
  credentialsSummary: string | null;
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

/** Structured profile page (SeekerProfile template): editable identity/
 * preference fields + a live "What recruiters see now" mirror panel. The
 * mirror panel reflects live-typed edits combined with the CURRENTLY SAVED
 * per-field visibility settings (`props.fieldVisibility`, read-only here) —
 * changing visibility mode itself now happens on the dedicated Privacy
 * settings page (DESIGN.md §13e: "Extract the card into a shared component;
 * the profile page keeps a link, not the controls"). Legal/privacy controls
 * the template omits — per-field visibility, market-insights opt-in, profile
 * visibility, the reveal-override toggle, consent management — live at
 * /seeker/settings/privacy (never dropped by the redesign, per the founder's
 * standing rule; just relocated). */
export function ProfileFields(props: ProfileFieldsProps) {
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
  const [credentials, setCredentials] = useState(props.credentials);
  const [minSalary, setMinSalary] = useState(props.minSalary?.toString() ?? "");
  const [workSetups, setWorkSetups] = useState<string[]>(props.workSetups);
  const [equityRequired, setEquityRequired] = useState(props.equityRequired);
  const [experience, setExperience] = useState<ExperienceRow[]>(props.experience);
  const [showAllExperience, setShowAllExperience] = useState(false);
  const fieldVisibility: FieldVisibilityMap = props.fieldVisibility ?? {};
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
                          if (equityRequired) fd.set("equity_required", "on");
                          fd.set("credentials", credentials);
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
  const salaryShownExternal = shareSalary && Boolean(minSalary);

  return (
    <main className="jb-fade mx-auto max-w-[960px] space-y-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
              Your profile
            </h1>
            {props.seekerTier === "pro" && <Badge variant="outline">Pro</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            How your profile looks to you
          </p>
        </div>
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
      </header>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}

      {!editing && (
        <Card className="jb-lift" data-testid="profile-identity-banner">
          <CardContent className="flex flex-col gap-3 pt-6">
            {headline && (
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                {headline}
              </span>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                {displayName || "—"}
              </h2>
              <span className="text-[13px] text-muted-foreground">
                {[props.email, phone].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {location && (
                <span className="text-[13px] text-muted-foreground">{location}</span>
              )}
              <Badge className="bg-accent text-accent-foreground" variant="secondary">
                {props.visibility === "active" ? "Actively looking" : "Not looking"}
              </Badge>
              {workSetups.map((s) => (
                <Badge key={s} variant="outline" className="capitalize">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <Card className="jb-lift">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex size-[76px] items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground">
                  {initialsOf(displayName)}
                </div>
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
              {editing ? (
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
              )}
            </CardContent>
          </Card>

          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Resume</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card className="jb-lift">
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
        </div>

        {/* Right column: main content + mirror panel on lg */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
          {/* Main content */}
          <div className="flex flex-col gap-4">
          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Salary &amp; availability</CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    {minSalary ? (
                      <>
                        <span className="text-lg font-semibold tracking-tight">
                          ${Number(minSalary).toLocaleString()}+
                        </span>
                        <span className="text-xs text-muted-foreground">Expected base salary</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No salary expectations set
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
                  <label className="flex items-center gap-2 self-end text-sm">
                    <input
                      type="checkbox"
                      checked={equityRequired}
                      onChange={(e) => setEquityRequired(e.target.checked)}
                      data-testid="dealbreaker-equity"
                    />
                    Equity required
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              {!editing ? (
                <div className="flex flex-wrap gap-2">
                  {skillsList.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No skills yet.
                    </span>
                  )}
                  {skillsList.map((s) => (
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

          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Credentials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {editing ? (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="credentials">
                    Awards, certifications, patents (free text)
                  </Label>
                  <Textarea
                    id="credentials"
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    rows={3}
                    placeholder="e.g. CISSP; AWS Solutions Architect Pro; 2 patents in fraud detection; won FinTech HK Innovator 2023"
                    data-testid="credentials-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    We generalize this on publish so it can&apos;t fingerprint you — recruiters see a
                    de-identified summary (e.g. &ldquo;patent-holder · cloud-certified · award
                    winner&rdquo;), never the specifics. Hide it entirely below if you prefer.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-sm whitespace-pre-wrap">
                    {credentials || <span className="text-muted-foreground">None yet.</span>}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="credentials-preview">
                    Recruiters see:{" "}
                    {fieldMode(fieldVisibility, "credentials") === "hidden"
                      ? "hidden by you"
                      : props.credentialsSummary || "generated when you publish"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Work experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {!editing ? (
                <>
                  {experience.length === 0 && (
                    <span className="text-sm text-muted-foreground">No entries yet.</span>
                  )}
                  {(showAllExperience ? experience : experience.slice(0, 3)).map((job, i) => (
                    <div key={job.id ?? i} className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{job.role || "—"}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {job.company}
                        {job.startDate ? ` · ${datesLabel(job.startDate, job.endDate)}` : ""}
                      </span>
                    </div>
                  ))}
                  {experience.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllExperience((v) => !v)}
                    >
                      {showAllExperience ? "Show fewer" : `Show all ${experience.length} roles`}
                    </Button>
                  )}
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
              )}
            </CardContent>
          </Card>

          <Card className="jb-lift">
            <CardHeader>
              <CardTitle className="text-sm">Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Desired roles</p>
                {!editing ? (
                  <div className="flex flex-wrap gap-2">
                    {desiredRolesList.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        None yet.
                      </span>
                    )}
                    {desiredRolesList.map((r) => (
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
                    {industriesList.length === 0 && (
                      <span className="text-sm text-muted-foreground">
                        None yet.
                      </span>
                    )}
                    {industriesList.map((ind) => (
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

              {!editing && referencesAvailable && (
                <p className="text-xs text-muted-foreground">References available on request.</p>
              )}
              {editing && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={referencesAvailable}
                    onChange={(e) => setReferencesAvailable(e.target.checked)}
                  />
                  References available on request
                </label>
              )}

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
                      if (equityRequired) fd.set("equity_required", "on");
                      fd.set("credentials", credentials);
                      workSetups.forEach((s) => fd.append("work_setups", s));
                      await saveDraft(fd);
                    });
                  }}
                >
                  {shareSalary ? "Shared" : "Hidden"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="jb-lift" data-testid="privacy-settings-link-card">
            <CardHeader>
              <CardTitle className="text-sm">Privacy &amp; consent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Field-level visibility, profile pause, consent management, &ldquo;who accessed my
                data&rdquo;, and data export/deletion controls all moved to a dedicated settings
                page.
              </p>
              <Button
                variant="outline"
                size="sm"
                data-testid="privacy-settings-link"
                render={<Link href="/seeker/settings/privacy" />}
              >
                Open Privacy settings
              </Button>
            </CardContent>
          </Card>
          </div>

          {/* Sticky recruiter preview panel */}
          <Card className="jb-lift lg:sticky lg:top-6 lg:h-fit">
            <CardHeader>
              <CardTitle className="text-sm">What recruiters see now</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {headlineShown && headline && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Headline
                  </span>
                  <p className="text-sm">{headline}</p>
                </div>
              )}

              {locationShown && location && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Location
                  </span>
                  <p className="text-sm">{regionFromLocation(location)}</p>
                </div>
              )}

              {salaryShownExternal && minSalary && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Salary expectations
                  </span>
                  <p className="text-sm font-semibold">${Number(minSalary).toLocaleString()}+</p>
                </div>
              )}

              {external.skills.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Skills
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {external.skills.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {external.desiredRoles.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Desired roles
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {external.desiredRoles.map((r) => (
                      <Badge key={r} variant="outline" className="text-xs">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {external.industries.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Target industries
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {external.industries.map((ind) => (
                      <Badge key={ind} variant="outline" className="text-xs">
                        {ind}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {external.referencesAvailable && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    References
                  </span>
                  <p className="text-sm">Available on request</p>
                </div>
              )}

              {fieldMode(fieldVisibility, "credentials") !== "hidden" && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Credentials
                  </span>
                  <p className="text-sm">{props.credentialsSummary || "—"}</p>
                </div>
              )}

              <Separator />

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Recruiters never see: your name, contact information, raw Resume, or work-history
                  entries. Only aggregate signals derived from your experience feed the match.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
