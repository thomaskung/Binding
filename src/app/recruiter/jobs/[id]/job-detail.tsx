"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYMENT_TYPE_LABEL, salaryDisplay } from "@/lib/jobs";
import { JobEditor, type EditableJob } from "../job-editor";

const STATUS_VARIANT = { draft: "outline", active: "default", closed: "secondary" } as const;

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
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="text-sm text-muted-foreground">{metaLine || "No details yet"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit posting
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/recruiter" />}>
            ← Postings
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Basics</CardTitle>
          <CardAction>
            <Badge variant="secondary">{matchCount} matches</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">{metaLine || "—"}</span>
          <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Salary</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-lg font-semibold tracking-tight">
            {salaryDisplay(job.salary_min, job.salary_max, job.salary_visibility)}
          </span>
          <Badge variant="outline">
            {job.salary_visibility === "public" ? "Public" : "On request"}
          </Badge>
        </CardContent>
      </Card>

      {job.skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Skills</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description}</p>
        </CardContent>
      </Card>

      {job.requirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {job.requirements.map((req) => (
                <li key={req}>{req}</li>
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
