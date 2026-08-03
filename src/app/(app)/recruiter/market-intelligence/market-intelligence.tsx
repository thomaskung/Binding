"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger } from "@binding/ui";
import type {
  SalaryTrendBySeniorityRow,
  SalaryTrendRow,
  SkillDemandByLocationRow,
  SkillDemandRow,
} from "@/lib/market-signals";

interface Props {
  skillDemand: SkillDemandRow[];
  salaryTrend: SalaryTrendRow[];
  skillDemandByLocation: SkillDemandByLocationRow[];
  salaryTrendBySeniority: SalaryTrendBySeniorityRow[];
}

function Cell({ suppressed, children }: { suppressed: boolean; children: React.ReactNode }) {
  if (suppressed) {
    return <span className="text-sm text-muted-foreground">Not enough data</span>;
  }
  return <span className="text-sm font-semibold tracking-tight">{children}</span>;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-[13px] last:border-b-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** Blur-locked deep-dive card (MarketIntelligence template frame A): a
 * placeholder layout renders blurred underneath a Locked badge + sales CTA.
 * Access is sales-conversation-gated — no self-serve unlock exists. */
function LockedCard({ title }: { title: string }) {
  return (
    <div className="relative">
      <Card size="sm" className="pointer-events-none select-none opacity-60 blur-[5px]">
        <CardHeader>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Row label="████ ████">
            <span className="text-sm">████</span>
          </Row>
          <Row label="████ ██">
            <span className="text-sm">████</span>
          </Row>
        </CardContent>
      </Card>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
        <Badge variant="outline">Locked</Badge>
        <Button size="sm" render={<a href="mailto:sales@jumponboard.example" />}>
          Get full access
        </Button>
      </div>
    </div>
  );
}

const SENIORITY_LABEL: Record<string, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  executive: "Executive",
};

/** Market intelligence (MarketIntelligence template): free teaser keeps the
 * headline aggregate cards unlocked and blur-locks the deep-dive breakdowns
 * (frame A); full access (frame B) unlocks them behind the same Skills/
 * Compensation tabs. Data comes only from the k-anonymized RPCs — cells
 * below the 20-person cohort render "Not enough data" in either frame.
 * "Preview full access" stays a dev-only affordance (sales-gated product). */
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
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Market intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Aggregate hiring signals from opted-in candidates — never individual data.
          </p>
        </div>
        <Badge variant={fullAccess ? "outline" : "secondary"}>
          {fullAccess ? "Contact us" : "Free"}
        </Badge>
      </header>

      <Tabs value={section} onValueChange={(v) => setSection(v as "skills" | "comp")}>
        <TabsList variant="line">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="comp">Compensation</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "skills" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">In-demand skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {skillDemand.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {skillDemand.map((row) => (
                <Row key={row.skill} label={row.skill}>
                  <Cell suppressed={row.suppressed}>{row.seekerCount} seekers</Cell>
                </Row>
              ))}
            </CardContent>
          </Card>

          {fullAccess ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Skill demand by location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {skillDemandByLocation.length === 0 && (
                  <p className="text-sm text-muted-foreground">No signals yet.</p>
                )}
                {skillDemandByLocation.map((row) => (
                  <Row key={`${row.skill}-${row.region}`} label={`${row.skill} — ${row.region}`}>
                    <Cell suppressed={row.suppressed}>{row.seekerCount} seekers</Cell>
                  </Row>
                ))}
              </CardContent>
            </Card>
          ) : (
            <LockedCard title="Skill demand by location" />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Salary-range trends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {salaryTrend.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {salaryTrend.map((row) => (
                <Row key={row.desiredRole} label={row.desiredRole}>
                  <Cell suppressed={row.suppressed}>
                    {row.avgMinSalary != null
                      ? `$${Number(row.avgMinSalary).toLocaleString()}+`
                      : ""}
                  </Cell>
                </Row>
              ))}
            </CardContent>
          </Card>

          {fullAccess ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Salary bands by seniority</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {salaryTrendBySeniority.length === 0 && (
                  <p className="text-sm text-muted-foreground">No signals yet.</p>
                )}
                {salaryTrendBySeniority.map((row) => (
                  <Row
                    key={`${row.desiredRole}-${row.seniorityBand}`}
                    label={`${row.desiredRole} — ${SENIORITY_LABEL[row.seniorityBand] ?? row.seniorityBand}`}
                  >
                    <Cell suppressed={row.suppressed}>
                      {row.avgMinSalary != null
                        ? `$${Number(row.avgMinSalary).toLocaleString()}+`
                        : ""}
                    </Cell>
                  </Row>
                ))}
              </CardContent>
            </Card>
          ) : (
            <LockedCard title="Salary bands by seniority" />
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
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
