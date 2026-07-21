"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@jumponboard/ui";
import { saveRecruiterProfile } from "../actions";

const COMPANY_SIZE_LABEL: Record<string, string> = {
  startup: "1–50 employees",
  mid: "51–500 employees",
  large: "501–5,000 employees",
  enterprise: "5,000+ employees",
};

const STATUS_VARIANT = { draft: "outline", active: "default", closed: "secondary" } as const;

interface Job {
  id: string;
  title: string;
  status: "draft" | "active" | "closed";
  location: string | null;
}

interface Props {
  displayName: string;
  recruiterTitle: string;
  companyName: string;
  companyIndustry: string;
  companySize: string | null;
  phone: string;
  email: string;
  jobs: Job[];
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

export function RecruiterProfileEditor(props: Props) {
  const [view, setView] = useState<"internal" | "external">("internal");
  const [displayName, setDisplayName] = useState(props.displayName);
  const [recruiterTitle, setRecruiterTitle] = useState(props.recruiterTitle);
  const [companyName, setCompanyName] = useState(props.companyName);
  const [companyIndustry, setCompanyIndustry] = useState(props.companyIndustry);
  const [companySize, setCompanySize] = useState(props.companySize ?? "");
  const [phone, setPhone] = useState(props.phone);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("display_name", displayName);
      fd.set("recruiter_title", recruiterTitle);
      fd.set("company_name", companyName);
      fd.set("company_industry", companyIndustry);
      fd.set("company_size", companySize);
      fd.set("phone", phone);
      await saveRecruiterProfile(fd);
      setStatus("Saved.");
    });
  }

  const activeJobs = props.jobs.filter((j) => j.status === "active");
  const visibleJobs = view === "internal" ? props.jobs : activeJobs;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            {view === "internal"
              ? "How your recruiter profile looks to you"
              : "What a candidate sees for one of your open roles"}
          </p>
        </div>
        {view === "internal" && (
          <Button disabled={pending} onClick={save}>
            Save changes
          </Button>
        )}
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as "internal" | "external")}>
        <TabsList variant="line">
          <TabsTrigger value="internal">Internal view</TabsTrigger>
          <TabsTrigger value="external">External view</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-[280px_1fr] items-start gap-5">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-19 w-19 items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-secondary-foreground">
                {initialsOf(displayName)}
              </div>
              {view === "internal" ? (
                <div className="flex w-full flex-col gap-2 text-left">
                  <div className="space-y-1">
                    <Label className="text-xs">Full name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={recruiterTitle}
                      onChange={(e) => setRecruiterTitle(e.target.value)}
                      placeholder="Talent Acquisition Lead"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <div className="text-lg font-semibold tracking-tight">{displayName}</div>
                  <div className="text-sm text-muted-foreground">{recruiterTitle || "—"}</div>
                  <div className="text-xs text-muted-foreground">{companyName || "—"}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {view === "internal" ? (
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-xs text-muted-foreground">Contact (never shown to candidates)</p>
                <Label className="text-xs">Email</Label>
                <Input value={props.email} disabled />
                <Label className="text-xs">Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex justify-center py-4">
                <Button variant="outline" size="sm">
                  Message recruiter
                </Button>
              </CardContent>
            </Card>
          )}

          {view === "internal" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reveal credits</CardTitle>
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
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Company info</CardTitle>
            </CardHeader>
            <CardContent>
              {view === "internal" ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Industry</Label>
                    <Input
                      value={companyIndustry}
                      onChange={(e) => setCompanyIndustry(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company size</Label>
                    <Select value={companySize} onValueChange={(v) => setCompanySize(v ?? "")}>
                      <SelectTrigger style={{ width: "100%" }}>
                        <SelectValue>
                          {companySize ? COMPANY_SIZE_LABEL[companySize] : "Select…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="startup">1–50</SelectItem>
                        <SelectItem value="mid">51–500</SelectItem>
                        <SelectItem value="large">501–5,000</SelectItem>
                        <SelectItem value="enterprise">5,000+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <div className="text-base font-semibold">{companyName || "—"}</div>
                  <div className="text-sm text-muted-foreground">
                    {[companyIndustry, companySize && COMPANY_SIZE_LABEL[companySize]]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{view === "internal" ? "Open roles" : "Matched job"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No postings yet.</p>
              ) : (
                visibleJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{job.title}</span>
                      <span className="text-xs text-muted-foreground">{job.location ?? "—"}</span>
                    </div>
                    <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </main>
  );
}
