"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@binding/ui";
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
    return <span className="text-[13px] text-muted-foreground">Not enough data</span>;
  }
  return <span className="text-[13px] font-semibold tracking-tight">{children}</span>;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-[13px] last:border-b-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** Skill-demand row rendered as a bar (mockup's "supply & demand map" frame)
 * scaled against the max seeker count on the page — the only real signal
 * this data has. The mockup also draws a second "demand" bar sourced from
 * live postings plus a momentum/tightness figure; there's no query backing
 * either yet, so — same call as the jobs-list funnel tiles — they're left
 * unbuilt rather than faked. */
function SkillBar({ skill, count, suppressed, max }: { skill: string; count: number | null; suppressed: boolean; max: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{skill}</span>
        <Cell suppressed={suppressed}>{count} seekers</Cell>
      </div>
      {/* Suppressed rows render a bare, indicator-less track — never a 0%
          bar, which would visually assert "zero seekers" for a cohort we
          were never allowed to measure. */}
      {suppressed || count == null ? (
        <div className="h-1.5 w-full rounded-full bg-muted" />
      ) : (
        <Progress value={Math.round((count / max) * 100)} className="h-1.5" />
      )}
    </div>
  );
}

/** Blur-locked deep-dive card (MarketIntelligence template frame A): a
 * placeholder layout renders blurred underneath a Locked badge + sales CTA.
 * Access is sales-conversation-gated — no self-serve unlock exists. */
function LockedCard({ title }: { title: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pointer-events-none select-none opacity-60 blur-[5px]">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pointer-events-none select-none space-y-2 opacity-60 blur-[5px]">
        <Row label="████ ████">
          <span className="text-[13px]">████</span>
        </Row>
        <Row label="████ ██">
          <span className="text-[13px]">████</span>
        </Row>
      </CardContent>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-background/50 p-4 text-center backdrop-blur-[2px]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-muted-foreground"
          aria-hidden
        >
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <Badge variant="outline">Locked</Badge>
        <Button size="sm" render={<a href="mailto:sales@getbinding.com" />}>
          Get full access
        </Button>
      </div>
    </Card>
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
 * below the 20-person cohort render "Not enough data" in either frame, never
 * a fabricated figure. The mockup's quarterly-briefing narrative findings
 * have no backing query and are deliberately left unbuilt (same standard as
 * the jobs-list funnel tiles). "Preview full access" stays a dev-only
 * affordance (sales-gated product). */
export function MarketIntelligence({
  skillDemand,
  salaryTrend,
  skillDemandByLocation,
  salaryTrendBySeniority,
}: Props) {
  const [previewFull, setPreviewFull] = useState(false);
  const [section, setSection] = useState<"skills" | "comp">("skills");
  const fullAccess = previewFull;

  const maxSkillCount = Math.max(
    1,
    ...skillDemand.filter((r) => !r.suppressed && r.seekerCount != null).map((r) => r.seekerCount as number),
  );

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">
            Market intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Aggregate hiring signals from opted-in candidates — never individual data.
          </p>
        </div>
        <Badge variant={fullAccess ? "outline" : "secondary"}>
          {fullAccess ? "Contact us" : "Free"}
        </Badge>
      </header>

      {!fullAccess && (
        <Card className="jb-lift jb-fade bg-accent/40 ring-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">See the whole market, not the teaser</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Salary bands by skill, the full quarterly briefing, and every deep-dive report.
              </p>
            </div>
            <Button size="sm" render={<a href="mailto:sales@getbinding.com" />}>
              Get full access
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={section} onValueChange={(v) => setSection(v as "skills" | "comp")}>
        <TabsList variant="line">
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="comp">Compensation</TabsTrigger>
        </TabsList>
      </Tabs>

      {section === "skills" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="jb-lift jb-fade">
            <CardHeader>
              <CardTitle>In-demand skills</CardTitle>
              <CardDescription>Opted-in candidates only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {skillDemand.length === 0 && (
                <p className="text-sm text-muted-foreground">No signals yet.</p>
              )}
              {skillDemand.map((row) => (
                <SkillBar
                  key={row.skill}
                  skill={row.skill}
                  count={row.seekerCount}
                  suppressed={row.suppressed}
                  max={maxSkillCount}
                />
              ))}
            </CardContent>
          </Card>

          {fullAccess ? (
            <Card className="jb-lift jb-fade">
              <CardHeader>
                <CardTitle>Skill demand by location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
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
          <Card className="jb-lift jb-fade">
            <CardHeader>
              <CardTitle>Salary-range trends</CardTitle>
              <CardDescription>Average minimum expected, by desired role</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
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
            <Card className="jb-lift jb-fade">
              <CardHeader>
                <CardTitle>Salary bands by seniority</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
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
        Aggregated from opted-in profiles, minimum cohort of 20 — no individual data. Low-cohort
        cells are suppressed, never estimated.
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
