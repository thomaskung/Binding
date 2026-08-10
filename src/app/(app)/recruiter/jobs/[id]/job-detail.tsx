"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardHeader, CardTitle } from "@binding/ui";
import { EMPLOYMENT_TYPE_LABEL, salaryDisplay } from "@/lib/jobs";
import { JobEditor, type EditableJob } from "../job-editor";

const STATUS_VARIANT = { draft: "outline", active: "default", closed: "secondary" } as const;
const STATUS_LABEL = { draft: "Draft", active: "Active", closed: "Closed" } as const;

/** Read-only posting detail (mockup "Edit posting" screen, jobsDetailView).
 * The mockup's Form/Canvas tab pair and sticky "Candidate sees" live preview
 * (which shows a raw `Match: 94%`) live only in the editor — that preview is
 * deliberately not built here since a simulated seeker-facing match % would
 * violate the qualitative-band invariant even as a mockup. `job-editor.tsx`
 * (the draft/edit form, shared with /recruiter/jobs/new) is out of scope for
 * this restyle pass — a draft posting therefore still opens into the
 * unstyled editor below. */
export function JobDetail({ job, matchCount }: { job: EditableJob; matchCount: number }) {
  // Drafts open straight into the edit form — there's nothing useful to view
  // yet. Published/closed jobs open in the read-only view.
  const [editing, setEditing] = useState(job.status === "draft");

  if (editing) {
    return <JobEditor job={job} />;
  }

  const metaLine = [job.department, job.location, EMPLOYMENT_TYPE_LABEL[job.employment_type]]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="jb-fade space-y-6">
      <Link
        href="/recruiter/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        ← All postings
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[26px] font-semibold leading-tight tracking-tight">
              {job.title}
            </h1>
            <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{metaLine || "No details yet"}</p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit posting
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardAction>
              <Badge variant="secondary">{matchCount} matches</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{metaLine || "—"}</CardContent>
        </Card>

        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>Salary</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <span className="jb-serif text-lg font-semibold tracking-tight">
              {salaryDisplay(job.salary_min!, job.salary_max!, job.salary_visibility)}
            </span>
            <Badge variant="outline">
              {job.salary_visibility === "public" ? "Public" : "On request"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {job.skills.length > 0 && (
        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="jb-lift">
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {job.description}
          </p>
        </CardContent>
      </Card>

      {job.requirements.length > 0 && (
        <Card className="jb-lift">
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {job.requirements.map((req) => (
                <li key={req} className="flex items-start gap-2.5">
                  <span className="mt-[7px] size-1.5 flex-none rounded-full bg-primary" />
                  <span className="leading-relaxed">{req}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Button variant="secondary" data-testid="view-matches" render={<Link href={`/recruiter/jobs/${job.id}/matches`} />}>
        View matches →
      </Button>
    </div>
  );
}
