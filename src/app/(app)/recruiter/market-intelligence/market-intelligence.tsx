"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Tabs, TabsList, TabsTrigger } from "@jumponboard/ui";
import type {
  SalaryTrendBySeniorityRow,
  SalaryTrendRow,
  SkillDemandByLocationRow,
  SkillDemandRow,
} from "@/lib/market-signals";

const FREE_TEASER_ROW_LIMIT = 2;

interface Props {
  skillDemand: SkillDemandRow[];
  salaryTrend: SalaryTrendRow[];
  skillDemandByLocation: SkillDemandByLocationRow[];
  salaryTrendBySeniority: SalaryTrendBySeniorityRow[];
}

function Locked() {
  return (
    <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      <span>Locked — full breakdown available on request</span>
      <span className="blur-sm select-none">████ ████</span>
    </div>
  );
}

function Cell({ suppressed, children }: { suppressed: boolean; children: React.ReactNode }) {
  if (suppressed) {
    return <span className="text-sm text-muted-foreground">Not enough data</span>;
  }
  return <span className="text-lg font-semibold tracking-tight">{children}</span>;
}

const SENIORITY_LABEL: Record<string, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  executive: "Executive",
};

/** Free-teaser + paid-depth (DESIGN.md §2e/§7 — unpriced new line item, per
 * the reviewed mockup's "Contact us" copy, not an existing subscription
 * tier). Real recruiters see the teaser; "Preview full access" is a
 * dev-only demo affordance, same posture as the seeker dev-tier toggle —
 * there is no self-serve unlock, access is sales-conversation-gated.
 * Skills/Compensation tabs + the by-location/by-seniority breakdowns are
 * Phase 3B — same free/paid teaser mechanic, more rows behind it. */
export function MarketIntelligence({
  skillDemand,
  salaryTrend,
  skillDemandByLocation,
  salaryTrendBySeniority,
}: Props) {
  const [previewFull, setPreviewFull] = useState(false);
  const [section, setSection] = useState<"skills" | "comp">("skills");
  const fullAccess = previewFull;

  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight">Market intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Aggregate hiring signals from opted-in candidates — never individual data.
          </p>
        </div>
        <Badge variant={fullAccess ? "default" : "outline"}>
          {fullAccess ? "Full access" : "Free teaser"}
        </Badge>
      </header>

      <Tabs value={section} onValueChange={(v) => setSection(v as "skills" | "comp")}>
        <TabsList variant="line">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="comp">Compensation</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "skills" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>In-demand skills</CardTitle>
              <CardDescription>Seekers with each skill in their profile, opted into market insights.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {skillDemand.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {skillDemand.map((row, i) =>
                fullAccess || i < FREE_TEASER_ROW_LIMIT ? (
                  <div key={row.skill} className="flex items-center justify-between">
                    <span className="text-sm">{row.skill}</span>
                    <Cell suppressed={row.suppressed}>{row.seekerCount} seekers</Cell>
                  </div>
                ) : (
                  <Locked key={row.skill} />
                ),
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demand by location</CardTitle>
              <CardDescription>Same skill signal, broken down by candidate region.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {skillDemandByLocation.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {skillDemandByLocation.map((row, i) =>
                fullAccess || i < FREE_TEASER_ROW_LIMIT ? (
                  <div key={`${row.skill}-${row.region}`} className="flex items-center justify-between">
                    <span className="text-sm">
                      {row.skill} <span className="text-muted-foreground">· {row.region}</span>
                    </span>
                    <Cell suppressed={row.suppressed}>{row.seekerCount} seekers</Cell>
                  </div>
                ) : (
                  <Locked key={`${row.skill}-${row.region}`} />
                ),
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Salary-range trends</CardTitle>
              <CardDescription>Average minimum base salary expectation by target role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {salaryTrend.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {salaryTrend.map((row, i) =>
                fullAccess || i < FREE_TEASER_ROW_LIMIT ? (
                  <div key={row.desiredRole} className="flex items-center justify-between">
                    <span className="text-sm">{row.desiredRole}</span>
                    <Cell suppressed={row.suppressed}>
                      {row.avgMinSalary != null ? `$${Number(row.avgMinSalary).toLocaleString()}+` : ""}
                    </Cell>
                  </div>
                ) : (
                  <Locked key={row.desiredRole} />
                ),
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Salary by seniority</CardTitle>
              <CardDescription>Same salary signal, broken down by years-of-experience band.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {salaryTrendBySeniority.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {salaryTrendBySeniority.map((row, i) =>
                fullAccess || i < FREE_TEASER_ROW_LIMIT ? (
                  <div
                    key={`${row.desiredRole}-${row.seniorityBand}`}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">
                      {row.desiredRole}{" "}
                      <span className="text-muted-foreground">
                        · {SENIORITY_LABEL[row.seniorityBand] ?? row.seniorityBand}
                      </span>
                    </span>
                    <Cell suppressed={row.suppressed}>
                      {row.avgMinSalary != null ? `$${Number(row.avgMinSalary).toLocaleString()}+` : ""}
                    </Cell>
                  </div>
                ) : (
                  <Locked key={`${row.desiredRole}-${row.seniorityBand}`} />
                ),
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!fullAccess && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">Get the full breakdown — trends by seniority and location.</p>
            <div className="flex items-center gap-2">
              <Button size="sm" render={<a href="mailto:sales@jumponboard.example" />}>
                Get full access
              </Button>
              <Badge variant="outline">Contact us</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />
      <p className="text-xs text-muted-foreground">
        Aggregated from opted-in profiles, minimum cohort of 20 — no individual data.
      </p>

      {process.env.NODE_ENV !== "production" && (
        <Button
          size="sm"
          variant="ghost"
          className="border border-dashed text-xs text-muted-foreground"
          onClick={() => setPreviewFull((v) => !v)}
        >
          Dev: preview full access — toggle
        </Button>
      )}
    </>
  );
}
