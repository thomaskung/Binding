import { Badge } from "@binding/ui";

/**
 * Enterprise · Preview (Binding.dc.html "RECRUITER · CANDIDATES", the
 * enterprise pipeline board, line ~772-799) — NOT a live feature. Static
 * fixture data only, no query, no server action. Roadmap surface for a
 * future enterprise tier; do not wire this to real matches/job_postings
 * data or add tests for it (CLAUDE.md: mock/preview only).
 */
interface FixtureCandidate {
  score: string;
  displayName: string;
  region: string;
  line: string;
  tag: string;
  costLabel: string;
}

interface FixtureJob {
  title: string;
  loc: string;
  count: number;
  cands: FixtureCandidate[];
}

const FIXTURE_BOARD: FixtureJob[] = [
  {
    title: "Senior Backend Engineer",
    loc: "Remote",
    count: 3,
    cands: [
      { score: "94", displayName: "Candidate A-142", region: "US", line: "8y distributed systems, payments", tag: "Interested", costLabel: "12 pts" },
      { score: "89", displayName: "Candidate B-207", region: "EU", line: "Platform + Kubernetes background", tag: "Surfaced", costLabel: "20 pts" },
      { score: "85", displayName: "Candidate C-318", region: "US", line: "Event-driven pipelines, Postgres", tag: "Surfaced", costLabel: "20 pts" },
    ],
  },
  {
    title: "Staff Product Designer",
    loc: "Hybrid — NYC",
    count: 2,
    cands: [
      { score: "91", displayName: "Candidate D-455", region: "US", line: "Design systems, 0→1 product", tag: "Interested", costLabel: "12 pts" },
      { score: "82", displayName: "Candidate E-561", region: "US", line: "B2B SaaS, research-driven", tag: "Surfaced", costLabel: "20 pts" },
    ],
  },
  {
    title: "Engineering Manager",
    loc: "Remote",
    count: 2,
    cands: [
      { score: "88", displayName: "Candidate F-609", region: "APAC", line: "Led 12-eng platform team", tag: "Surfaced", costLabel: "20 pts" },
      { score: "79", displayName: "Candidate G-733", region: "US", line: "First EM hire, infra background", tag: "Surfaced", costLabel: "20 pts" },
    ],
  },
];

const TAG_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  Interested: "default",
  Surfaced: "outline",
};

export function EnterprisePipelineBoard() {
  return (
    <div className="jb-fade space-y-4">
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3"
        style={{ background: "var(--accent)" }}
      >
        <span className="text-[12px] font-semibold" style={{ color: "var(--primary)" }}>
          Enterprise pipeline — compare candidate depth across every open role at once.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIXTURE_BOARD.map((job) => (
          <div key={job.title} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2 border-b-2 border-border pb-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{job.title}</p>
                <p className="text-[10.5px] text-muted-foreground">{job.loc}</p>
              </div>
              <span
                className="flex-none rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ color: "var(--primary)", background: "var(--accent)" }}
              >
                {job.count}
              </span>
            </div>
            {job.cands.map((c) => (
              <div
                key={c.displayName}
                className="jb-lift flex flex-col gap-2 rounded-xl border p-3"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex size-9 flex-none items-center justify-center rounded-[10px]"
                    style={{ color: "var(--primary)", background: "var(--accent)" }}
                  >
                    <span className="jb-serif text-[14px] font-semibold">{c.score}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{c.displayName}</p>
                    <p className="text-[10.5px] text-muted-foreground">{c.region}</p>
                  </div>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{c.line}</p>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={TAG_VARIANT[c.tag] ?? "outline"}>{c.tag}</Badge>
                  <span className="text-[11px] font-semibold" style={{ color: "var(--primary)" }}>
                    {c.costLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
