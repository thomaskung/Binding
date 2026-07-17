"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

export function JobEditor({ job }: { job: EditableJob | null }) {
  const [description, setDescription] = useState(job?.description ?? "");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refine() {
    startTransition(async () => {
      setStatus("Refining JD…");
      const refined = await refineJobText(description);
      setSuggestion(refined);
      setStatus(null);
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{job ? "Edit job" : "Post a job"}</h1>
          {job && <Badge>{job.status}</Badge>}
        </div>
        <Button variant="ghost" render={<Link href="/recruiter" />}>
          ← Postings
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Job details</CardTitle>
          <CardDescription>
            {job?.status === "active"
              ? "Editing an active job re-embeds the JD and refreshes matches on save+publish."
              : "Drafts are private. Publishing embeds the JD and surfaces matches."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={(fd) => {
              fd.set("description", description);
              if (job) fd.set("id", job.id);
              startTransition(async () => {
                await saveJob(fd);
                setStatus("Saved.");
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" data-testid="job-title" defaultValue={job?.title ?? ""} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
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
              <Textarea
                id="description"
                data-testid="job-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                required
              />
            </div>

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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salary_min">Salary min (USD)</Label>
                <Input id="salary_min" name="salary_min" type="number" defaultValue={job?.salary_min ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Salary max (USD)</Label>
                <Input
                  id="salary_max"
                  name="salary_max"
                  data-testid="job-salary-max"
                  type="number"
                  defaultValue={job?.salary_max ?? ""}
                />
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
                        defaultChecked={job?.work_setups.includes(setup) ?? false}
                      />
                      {setup}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={pending} data-testid="save-job">
                {job ? "Save changes" : "Create draft"}
              </Button>
              {job && job.status !== "closed" && (
                <>
                  <Button
                    type="button"
                    data-testid="publish-job"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const fd = new FormData();
                        fd.set("id", job.id);
                        fd.set("title", (document.getElementById("title") as HTMLInputElement).value);
                        fd.set("description", description);
                        const salaryMin = (document.getElementById("salary_min") as HTMLInputElement).value;
                        const salaryMax = (document.getElementById("salary_max") as HTMLInputElement).value;
                        if (salaryMin) fd.set("salary_min", salaryMin);
                        if (salaryMax) fd.set("salary_max", salaryMax);
                        document
                          .querySelectorAll<HTMLInputElement>('input[name="work_setups"]:checked')
                          .forEach((el) => fd.append("work_setups", el.value));
                        await saveJob(fd);
                        await publishJob(job.id);
                        setStatus("Published — matches refreshed.");
                      })
                    }
                  >
                    {job.status === "active" ? "Re-publish & refresh matches" : "Publish"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => startTransition(() => closeJob(job.id))}
                  >
                    Close job
                  </Button>
                </>
              )}
            </div>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </form>
        </CardContent>
      </Card>

      {job && (
        <Button
          variant="secondary"
          data-testid="view-matches"
          render={<Link href={`/recruiter/jobs/${job.id}/matches`} />}
        >
          View matches →
        </Button>
      )}
    </main>
  );
}
