import { requireRole } from "@/lib/auth";
import { Badge, Button, Card, CardContent } from "@binding/ui";

/**
 * Enterprise · Preview (Binding.dc.html "RECRUITER · TEAM TRAINING") — NOT a
 * live feature. Static fixture data only: no server actions, no queries, no
 * migrations, no tests. Roadmap surface for a future enterprise tier — see
 * CLAUDE.md's Track B note before wiring anything here to real data.
 */
const COMPLIANCE_TRACKS = [
  { title: "Fair Hiring & Bias Awareness", note: "Annual mandatory refresher", cost: "1 seat", pct: 72, pctLabel: "72% complete", cta: "Continue" },
  { title: "Data Privacy for Recruiters", note: "Required before candidate contact", cost: "1 seat", pct: 40, pctLabel: "40% complete", cta: "Continue" },
];

export default async function RecruiterEnterpriseTrainingPage() {
  await requireRole("recruiter");

  return (
    <main className="jb-fade mx-auto max-w-3xl space-y-6 px-6 py-14">
      <header className="flex flex-col gap-1.5">
        <Badge
          variant="outline"
          className="w-fit text-[10px] font-bold uppercase tracking-wide"
          style={{ color: "var(--primary)", background: "var(--accent)" }}
        >
          Enterprise · Preview — not a live feature, roadmap only
        </Badge>
        <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
          Team training
        </h1>
        <p className="max-w-2xl text-[13.5px] text-muted-foreground">
          Assign mandatory compliance seats. Enterprise-purchased seats stay segregated from
          personal credits.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COMPLIANCE_TRACKS.map((t) => (
          <Card key={t.title} className="jb-lift">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold">{t.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{t.note}</p>
                </div>
                <Badge variant="outline">{t.cost}</Badge>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full"
                  style={{ width: `${t.pct}%`, background: "var(--primary)" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">{t.pctLabel}</span>
                <Button size="sm" variant="outline">
                  {t.cta}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border p-5">
        <div>
          <p className="text-[14px] font-semibold">Compliance seat bundle</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            18 of 25 seats assigned · renews annually
          </p>
        </div>
        <Button size="sm">Assign seats</Button>
      </div>
    </main>
  );
}
