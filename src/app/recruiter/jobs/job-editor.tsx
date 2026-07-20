"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPES, type EmploymentType, type SalaryVisibility } from "@/lib/jobs";
import { closeJob, publishJob, refineJobText, saveJob } from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

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
  const [visibility, setVisibility] = useState<SalaryVisibility>(job?.salary_visibility ?? "public");
  const [workSetups, setWorkSetups] = useState<string[]>(job?.work_setups ?? []);
  const [skillsText, setSkillsText] = useState((job?.skills ?? []).join(", "));
  const [description, setDescription] = useState(job?.description ?? "");
  const [responsibilitiesText, setResponsibilitiesText] = useState(
    (job?.responsibilities ?? []).join("\n"),
  );
  const [requirementsText, setRequirementsText] = useState((job?.requirements ?? []).join("\n"));

  const [suggestion, setSuggestion] = useState<string | null>(null);
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
    if (salaryMin) fd.set("salary_min", salaryMin);
    if (salaryMax) fd.set("salary_max", salaryMax);
    workSetups.forEach((s) => fd.append("work_setups", s));
    return fd;
  }

  function refine() {
    startTransition(async () => {
      setStatus("Refining JD…");
      const refined = await refineJobText(description);
      setSuggestion(refined);
      setStatus(null);
    });
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
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-8 flex items-center justify-between gap-6 border-b bg-background px-8 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/recruiter" />}>
            ← Cancel
          </Button>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{title.trim() || "Untitled role"}</span>
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

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Basics</h2>
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

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Compensation</h2>
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
          <div className="space-y-2">
            <Label>Salary visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as SalaryVisibility)}>
              <SelectTrigger style={{ width: "100%" }}>
                <SelectValue>{visibility === "public" ? "Show publicly" : "On request only"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Show publicly</SelectItem>
                <SelectItem value="on_request">On request only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {visibility === "public"
                ? "The salary range is shown on the posting."
                : "Candidates see “Salary on request” and can ask during matching."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Skills</h2>
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              About the role
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !description.trim()}
              onClick={refine}
            >
              Refine with AI
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">A short summary of what this person will own.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            data-testid="job-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the team, the mission, and what success looks like…"
            rows={6}
            required
          />
          {suggestion !== null && (
            <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
              <div>
                <p className="mb-2 text-sm font-medium">Current</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{description}</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">AI suggestion</p>
                <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setDescription(suggestion);
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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

      <Card>
        <CardHeader>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Requirements</h2>
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
