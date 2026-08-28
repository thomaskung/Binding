import { requireRole } from "@/lib/auth";
import { Badge, Button } from "@binding/ui";
import { CompCohortTable } from "./comp-cohort-table";

/**
 * Enterprise · Preview (Binding.dc.html "RECRUITER · COMPENSATION
 * ADVISORY") — NOT a live feature. Static fixture data only: no server
 * actions, no queries, no migrations, no tests. Roadmap surface for a
 * future enterprise tier — see CLAUDE.md's Track B note before wiring
 * anything here to real data.
 */
const COMP_ALERTS = [
  { title: "Backend Senior cohort has trailed market for 2 cycles", sub: "24 employees affected · last reviewed Q1 2026", btnLabel: "Review", btnVariant: "default" as const },
  { title: "Frontend Mid-level dipped below the watch threshold", sub: "18 employees affected · first flagged this cycle", btnLabel: "Dismiss", btnVariant: "outline" as const },
];

export default async function RecruiterEnterpriseCompensationPage() {
  await requireRole("recruiter");

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <div className="flex flex-col gap-1.5">
        <Badge
          variant="outline"
          className="w-fit text-[10px] font-bold uppercase tracking-wide"
          style={{ color: "var(--primary)", background: "var(--accent)" }}
        >
          Enterprise · Preview — not a live feature, roadmap only
        </Badge>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Comp briefing · Q3 2026
        </p>
        <h1 className="font-heading text-[28px] font-medium leading-snug tracking-tight">
          Backend seniors are the one cohort trailing the market.
        </h1>
        <p className="max-w-2xl text-[14px] text-muted-foreground">
          Aggregate, k-anonymized comp intelligence comparing your teams to the external market.
          No employee is ever named, ranked, or flagged.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <span className="text-[13px] font-semibold">Flagged this cycle</span>
          <Badge variant="outline">{COMP_ALERTS.length} pending</Badge>
        </div>
        {COMP_ALERTS.map((a) => (
          <div
            key={a.title}
            className="flex items-center justify-between gap-4 border-b px-5 py-3.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{a.title}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{a.sub}</p>
            </div>
            <Button size="sm" variant={a.btnVariant}>
              {a.btnLabel}
            </Button>
          </div>
        ))}
      </div>

      <CompCohortTable />
    </main>
  );
}
