"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Tabs, TabsList, TabsTrigger } from "@binding/ui";
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

/** Recruiter profile (RecruiterProfile template): Internal/External view
 * tabs + a global view/edit mode. External is what a matched candidate
 * sees — active roles only, contact-free, in-platform messaging. The
 * template's Team-members card is not built: no team/seat model exists yet
 * (enterprise is a disabled placeholder), and fake teammates would lie. */
export function RecruiterProfileEditor(props: Props) {
  const [view, setView] = useState<"internal" | "external">("internal");
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(props.displayName);
  const [recruiterTitle, setRecruiterTitle] = useState(props.recruiterTitle);
  const [companyName, setCompanyName] = useState(props.companyName);
  const [companyIndustry, setCompanyIndustry] = useState(props.companyIndustry);
  const [companySize, setCompanySize] = useState(props.companySize ?? "");
  const [phone, setPhone] = useState(props.phone);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const internal = view === "internal";

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
      setEditing(false);
    });
  }

  const activeJobs = props.jobs.filter((j) => j.status === "active");
  const visibleJobs = internal ? props.jobs : activeJobs;

  return (
    <main className="mx-auto max-w-[920px] space-y-6 px-6 py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Your profile</h1>
          <p className="text-[15px] text-muted-foreground">
            {internal
              ? "How your recruiter profile looks to you"
              : "What this candidate sees for their matched role"}
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
        value={view}
        onValueChange={(v) => {
          setView(v as "internal" | "external");
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
                    <div className="text-sm text-muted-foreground">{recruiterTitle || "—"}</div>
                    <div className="text-[13px] text-muted-foreground">{companyName || "—"}</div>
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
                    <Label className="text-xs" htmlFor="recruiter_title">Title</Label>
                    <Input
                      id="recruiter_title"
                      value={recruiterTitle}
                      onChange={(e) => setRecruiterTitle(e.target.value)}
                      placeholder="Talent Acquisition Lead"
                    />
                  </div>
                </div>
              )}
              <Separator className="my-3.5" />
              {internal ? (
                editing ? (
                  <div className="flex flex-col gap-2.5 text-left">
                    <div className="space-y-1">
                      <Label className="text-xs">Email (never shown to candidates)</Label>
                      <Input value={props.email} disabled />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="phone">Phone (never shown to candidates)</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-[13px]">{props.email}</span>
                    <span className="text-[13px] text-muted-foreground">{phone || "—"}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      Visible to you only. Never shared with candidates.
                    </span>
                  </div>
                )
              ) : (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm">
                    Message recruiter
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {internal && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reveal credits</CardTitle>
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
              <div className="flex items-start gap-4">
                <div className="flex size-[52px] flex-none items-center justify-center rounded-[10px] bg-secondary text-base font-semibold text-secondary-foreground">
                  {(companyName || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-1 flex-col gap-2.5">
                  {!editing ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="text-[15px] font-semibold">{companyName || "—"}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {[companyIndustry, companySize && COMPANY_SIZE_LABEL[companySize]]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="company_name">Company</Label>
                        <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="company_industry">Industry</Label>
                        <Input
                          id="company_industry"
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
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{internal ? "Open roles" : "Matched job"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {visibleJobs.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  {internal ? "No postings yet." : "No active roles."}
                </span>
              )}
              {visibleJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/recruiter/jobs/${job.id}`}
                      className="text-sm font-semibold hover:underline"
                    >
                      {job.title}
                    </Link>
                    <span className="text-[13px] text-muted-foreground">{job.location ?? "—"}</span>
                  </div>
                  <Badge variant={STATUS_VARIANT[job.status]}>
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
