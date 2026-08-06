"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AIDocumentCanvas,
  type AIDocumentSuggestion,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@binding/ui";
import { EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPES, type EmploymentType, type SalaryVisibility } from "@/lib/jobs";
import { closeJob, publishJob, refineJobText, saveJob } from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

const JD_QUICK_ACTIONS = ["Tighten wording", "More inclusive language", "Add impact metrics", "Shorten"];

export interface EditableJob {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "closed";
  salary_min: number | null;
  salary_max: number | null;
  work_setups: string[];
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  salary_visibility: SalaryVisibility;
  offers_equity: boolean;
  skills: string[];
  responsibilities: string[];
  requirements: string[];
}

export function JobEditor({ job }: { job: EditableJob | null }) {
  const [title, setTitle] = useState(job?.title ?? "");
  const [department, setDepartment] = useState(job?.department ?? "");
  const [location, setLocation] = useState(job?.location ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(job?.employment_type ?? "fulltime");
  const [salaryMin, setSalaryMin] = useState(job?.salary_min?.toString() ?? "");
  const [salaryMax, setSalaryMax] = useState(job?.salary_max?.toString() ?? "");
  // Stealth ("on_request") is the default for new postings — salary visibility
  // is opt-in-to-public, not opt-out (privacy invariant: hidden by default).
  const [visibility, setVisibility] = useState<SalaryVisibility>(job?.salary_visibility ?? "on_request");
  const [offersEquity, setOffersEquity] = useState(job?.offers_equity ?? false);
  const [workSetups, setWorkSetups] = useState<string[]>(job?.work_setups ?? []);
  const [skillsText, setSkillsText] = useState((job?.skills ?? []).join(", "));
  const [description, setDescription] = useState(job?.description ?? "");
  const [responsibilitiesText, setResponsibilitiesText] = useState(
    (job?.responsibilities ?? []).join("\n"),
  );
  const [requirementsText, setRequirementsText] = useState((job?.requirements ?? []).join("\n"));

  const [suggestions, setSuggestions] = useState<AIDocumentSuggestion[]>([]);
  const [askValue, setAskValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const completion = useMemo(() => {
    const fields = [
      title.trim(),
      location.trim(),
      department.trim(),
      salaryMin.trim() && salaryMax.trim(),
      skillsText.trim(),
      description.trim(),
      responsibilitiesText.trim(),
      requirementsText.trim(),
    ];
    return fields.filter(Boolean).length;
  }, [title, location, department, salaryMin, salaryMax, skillsText, description, responsibilitiesText, requirementsText]);

  function buildFormData() {
    const fd = new FormData();
    if (job) fd.set("id", job.id);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("department", department);
    fd.set("location", location);
    fd.set("employment_type", employmentType);
    fd.set("salary_visibility", visibility);
    fd.set("skills", skillsText);
    fd.set("responsibilities", responsibilitiesText);
    fd.set("requirements", requirementsText);
    fd.set("offers_equity", offersEquity ? "on" : "");
    if (salaryMin) fd.set("salary_min", salaryMin);
    if (salaryMax) fd.set("salary_max", salaryMax);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  // refineJobText only takes the JD text itself (no free-text instruction
  // param on the server action) — the quick-action label / ask text drives
  // the suggestion's title in the UI, but is never spliced into the text
  // sent for refinement.
  function refine(suggestionTitle: string) {
    if (!description.trim()) return;
    startTransition(async () => {
      setStatus("Refining JD…");
      const before = description;
      const refined = await refineJobText(before);
      // The rail is 336px wide — truncate the "before" preview (only ever
      // display copy; the full `before` text is never sent anywhere and
      // `after` — what actually gets applied — stays untruncated).
      const beforePreview = before.length > 160 ? `${before.slice(0, 160)}…` : before;
      setSuggestions((prev) => [
        { id: `refine-${Date.now()}`, title: suggestionTitle, before: beforePreview, after: refined, status: "pending" },
        ...prev,
      ]);
      setStatus(null);
    });
  }

  function applySuggestion(id: string) {
    const target = suggestions.find((s) => s.id === id);
    if (!target) return;
    setDescription(target.after);
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "applied" } : s)));
  }

  function dismissSuggestion(id: string) {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "dismissed" } : s)));
  }

  function askAi() {
    if (!askValue.trim()) return;
    refine(askValue.trim());
    setAskValue("");
  }

  function saveDraft() {
    startTransition(async () => {
      await saveJob(buildFormData());
      setStatus("Saved.");
    });
  }

  function publish() {
    startTransition(async () => {
      await saveJob(buildFormData());
      if (job) {
        await publishJob(job.id);
        setStatus("Published — matches refreshed.");
      }
    });
  }

  return (
    <div className="jb-fade space-y-6">
      <div className="sticky top-0 z-10 -mx-8 flex items-center justify-between gap-6 border-b border-border bg-background/95 px-8 py-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/recruiter/jobs" />}>
            ← Cancel
          </Button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{title.trim() || "Untitled role"}</span>
            <span className="text-xs text-muted-foreground">{completion} of 8 fields complete</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} data-testid="save-job" onClick={saveDraft}>
            Save draft
          </Button>
          {job && job.status !== "closed" && (
            <Button size="sm" disabled={pending} data-testid="publish-job" onClick={publish}>
              {job.status === "active" ? "Re-publish" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {!job && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            New posting
          </p>
          <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
            Create a job posting
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Fill in the details below. You can save as a draft and finish later.
          </p>
        </div>
      )}

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Basics
          </h2>
          <p className="text-sm text-muted-foreground">The essentials candidates see first.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              data-testid="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote / Hybrid"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Employment type</Label>
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger style={{ width: "100%" }}>
                <SelectValue>{EMPLOYMENT_TYPE_LABEL[employmentType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Work setups</Label>
            <div className="flex gap-3 pt-2">
              {WORK_SETUPS.map((setup) => (
                <label key={setup} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="work_setups"
                    value={setup}
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
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Salary &amp; visibility
          </h2>
          <p className="text-sm text-muted-foreground">Set a range and choose whether it&apos;s public.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salary_min">Minimum (USD/yr)</Label>
              <Input
                id="salary_min"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="180000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary_max">Maximum (USD/yr)</Label>
              <Input
                id="salary_max"
                data-testid="job-salary-max"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="220000"
              />
            </div>
          </div>

          {/* Prominent, defaults-to-hidden salary visibility control — stealth
              is the default posture (privacy invariant), public is the
              explicit opt-in via this switch. */}
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">Show salary band to candidates</span>
              <span className="text-[13px] leading-normal text-muted-foreground">
                {visibility === "public"
                  ? "The salary range is shown on the posting."
                  : "Hidden by default — candidates see “Salary on request” and can ask during matching."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visibility === "public"}
              aria-label="Show salary band to candidates"
              data-testid="job-salary-visibility-toggle"
              onClick={() => setVisibility((v) => (v === "public" ? "on_request" : "public"))}
              className={
                "relative h-6 w-10 flex-none rounded-full transition-colors " +
                (visibility === "public" ? "bg-primary" : "bg-secondary")
              }
            >
              <span
                className={
                  "absolute top-0.5 size-5 rounded-full bg-primary-foreground shadow transition-[left] " +
                  (visibility === "public" ? "left-[18px]" : "left-0.5")
                }
              />
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offersEquity}
              onChange={(e) => setOffersEquity(e.target.checked)}
              data-testid="job-offers-equity"
            />
            This role offers equity
          </label>
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Skills
          </h2>
          <p className="text-sm text-muted-foreground">Used to match candidates to this role.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            placeholder="Node.js, PostgreSQL, AWS, System Design"
            rows={3}
          />
          {skillsText.trim() && (
            <div className="flex flex-wrap gap-2">
              {skillsText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Separate skills with commas.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            About the role
          </h2>
          <p className="text-sm text-muted-foreground">A short summary of what this person will own.</p>
        </div>
        <AIDocumentCanvas
          canvasTitle="Job post canvas"
          docText={description}
          onDocTextChange={setDescription}
          docPlaceholder="Describe the team, the mission, and what success looks like…"
          docTestId="job-description"
          introText={
            suggestions.some((s) => s.status === "pending")
              ? "Apply a suggestion below, or ask for something specific."
              : "I can tighten this JD, sharpen impact language, or match your team's tone — try a quick action or ask for something specific."
          }
          quickActions={JD_QUICK_ACTIONS}
          onQuickAction={refine}
          suggestions={suggestions}
          onApplySuggestion={applySuggestion}
          onDismissSuggestion={dismissSuggestion}
          askValue={askValue}
          onAskChange={setAskValue}
          onAskSubmit={askAi}
          askPlaceholder="Ask AI to rewrite…"
          saved={status === "Saved."}
          busy={pending}
          askTestId="job-description-ask"
          sendTestId="job-description-ask-send"
        />
      </div>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            What they&apos;ll do
          </h2>
          <p className="text-sm text-muted-foreground">One responsibility per line.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={responsibilitiesText}
            onChange={(e) => setResponsibilitiesText(e.target.value)}
            placeholder={"Own the payments ledger service\nScale core services\nPartner with product and infra"}
            rows={5}
          />
        </CardContent>
      </Card>

      <Card className="jb-lift">
        <CardHeader>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Requirements
          </h2>
          <p className="text-sm text-muted-foreground">One requirement per line.</p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={requirementsText}
            onChange={(e) => setRequirementsText(e.target.value)}
            placeholder={"6+ years building backend services\nExperience with distributed systems\nStrong PostgreSQL and AWS"}
            rows={5}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">{completion} of 8 fields complete</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={pending} onClick={saveDraft}>
            Save draft
          </Button>
          {job && job.status !== "closed" && (
            <>
              <Button size="lg" disabled={pending} onClick={publish}>
                {job.status === "active" ? "Re-publish & refresh matches" : "Publish posting"}
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => startTransition(() => closeJob(job.id))}>
                Close job
              </Button>
            </>
          )}
        </div>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {job && (
        <Button
          variant="secondary"
          data-testid="view-matches"
          render={<Link href={`/recruiter/jobs/${job.id}/matches`} />}
        >
          View matches →
        </Button>
      )}
    </div>
  );
}
