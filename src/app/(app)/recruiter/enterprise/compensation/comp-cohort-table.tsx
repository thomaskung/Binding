"use client";

import { useState } from "react";
import { Badge } from "@binding/ui";

interface CohortRow {
  role: string;
  count: number;
  deltaPct: string;
  status: string;
  statusVariant: "default" | "secondary" | "outline";
  rec: string;
}

const COHORT_ROWS: CohortRow[] = [
  { role: "Backend Senior", count: 24, deltaPct: "-8%", status: "Trailing market", statusVariant: "outline", rec: "Consider a 5-8% band adjustment at next review — this cohort has trailed the external market for two consecutive quarters." },
  { role: "Product Design Staff", count: 12, deltaPct: "+3%", status: "On market", statusVariant: "secondary", rec: "No action needed — compensation is within a healthy range of the external benchmark." },
  { role: "Engineering Manager", count: 9, deltaPct: "+1%", status: "On market", statusVariant: "secondary", rec: "No action needed — compensation is within a healthy range of the external benchmark." },
  { role: "Frontend Mid-level", count: 18, deltaPct: "-4%", status: "Watch", statusVariant: "outline", rec: "Slightly below market — not urgent, but worth revisiting at the next comp cycle." },
];

/** Expandable cohort rows (Binding.dc.html "RECRUITER · COMPENSATION
 * ADVISORY") — static fixture data, local click-to-expand only. */
export function CompCohortTable() {
  const [openRole, setOpenRole] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className="border-b px-5 py-4">
        <p className="text-[16px] font-semibold tracking-tight">Team comp vs. market</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          By skill cohort · click a row for the recommendation
        </p>
      </div>
      {COHORT_ROWS.map((c) => {
        const open = openRole === c.role;
        return (
          <div
            key={c.role}
            role="button"
            tabIndex={0}
            onClick={() => setOpenRole(open ? null : c.role)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenRole(open ? null : c.role);
              }
            }}
            className="jb-row cursor-pointer border-b px-5 py-4 last:border-b-0"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold">{c.role}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">cohort of {c.count}</p>
              </div>
              <div className="flex flex-none items-center gap-3.5">
                <span className="text-[13px] text-muted-foreground">{c.deltaPct} vs market</span>
                <Badge variant={c.statusVariant}>{c.status}</Badge>
              </div>
            </div>
            {open && (
              <div className="mt-3 rounded-[10px] bg-muted p-3 text-[12.5px] leading-snug text-foreground/80">
                {c.rec}
              </div>
            )}
          </div>
        );
      })}
      <div className="px-5 py-3.5 text-[11px] text-muted-foreground">
        Uses pseudonymized skill vectors; cohorts below the k-threshold are suppressed, never
        estimated.
      </div>
    </div>
  );
}
