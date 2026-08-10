"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@binding/ui";
import type { MatchBand } from "@/lib/matching";
import { salaryDisplay, type SalaryVisibility } from "@/lib/jobs";
import { MatchResponseButtons } from "./match-response";
import { FocusReview } from "./focus-review";

export interface SeekerMatchCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  /** Recruiter-controlled: 'on_request' hides the figure (default). The raw
   * numbers are stripped upstream for on_request jobs — this only drives the
   * salaryDisplay() label. */
  salaryVisibility: SalaryVisibility;
  workSetups: string[];
  status: "surfaced" | "interested" | "declined" | "revealed";
  band: MatchBand;
  /** Ordinal position by true score, 1 = best. Never the raw score itself —
   * lets "best match" sort work without exposing exact cosine similarity. */
  rank: number;
  pendingOverride: boolean;
  threadId: string | null;
}

export const BAND_LABEL: Record<MatchBand, string> = {
  high: "High match",
  normal: "Normal match",
  low: "Low match",
};
export const BAND_VARIANT: Record<MatchBand, "default" | "secondary" | "outline"> = {
  high: "default",
  normal: "secondary",
  low: "outline",
};

/** Assemble the meta-line for a match card: company, location, salary, work setups. */
export function cardMeta(card: SeekerMatchCard): string {
  return [
    card.company,
    card.location,
    // salaryDisplay no longer accepts null (both bounds NOT NULL since
    // migration 0023); on_request jobs carry null bounds by design (privacy —
    // the raw range is never shipped to the client), so guard before calling it.
    card.salaryMin != null && card.salaryMax != null
      ? salaryDisplay(card.salaryMin, card.salaryMax, card.salaryVisibility)
      : "Salary on request",
    card.workSetups.join(" / ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const STATUS_FILTERS = ["all", "surfaced", "interested", "revealed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SortKey = "match" | "salary" | "title";
const SORT_LABEL: Record<SortKey, string> = {
  match: "Best match",
  salary: "Highest salary",
  title: "Title A–Z",
};

export function MatchList({ cards }: { cards: SeekerMatchCard[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("match");
  const [focusMode, setFocusMode] = useState(false);

  const visible = useMemo(() => {
    const filtered =
      statusFilter === "all" ? cards : cards.filter((c) => c.status === statusFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "salary") return (b.salaryMax ?? 0) - (a.salaryMax ?? 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return a.rank - b.rank;
    });
  }, [cards, statusFilter, sortBy]);

  if (cards.length === 0) {
    return (
      <Card className="jb-fade">
        <div className="px-4 py-10 text-center text-muted-foreground">
          No matches yet. Matches appear when an active job aligns with your
          skills and dealbreakers.
        </div>
      </Card>
    );
  }

  if (focusMode) {
    return <FocusReview cards={cards} onExit={() => setFocusMode(false)} />;
  }

  return (
    <div className="jb-fade space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="surfaced">Surfaced</TabsTrigger>
            <TabsTrigger value="interested">Interested</TabsTrigger>
            <TabsTrigger value="revealed">Revealed</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger style={{ width: 170 }}>
              <SelectValue>{SORT_LABEL[sortBy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">Best match</SelectItem>
              <SelectItem value="salary">Highest salary</SelectItem>
              <SelectItem value="title">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFocusMode(true)}
            disabled={!visible.some((c) => c.status === "surfaced")}
          >
            Review matches
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="jb-fade">
          <div className="px-4 py-10 text-center text-muted-foreground">
            No matches in this filter.
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((card) => {
<<<<<<< HEAD
            const meta = [
              card.company,
              card.location,
              // salaryDisplay no longer accepts null (both bounds NOT NULL since
              // migration 0023); on_request jobs carry null bounds by design
              // (privacy — the raw range is never shipped to the client), so
              // guard before calling it.
              card.salaryMin != null && card.salaryMax != null
                ? salaryDisplay(card.salaryMin, card.salaryMax, card.salaryVisibility)
                : "Salary on request",
              card.workSetups.join(" / ") || null,
            ]
              .filter(Boolean)
              .join(" · ");
=======
            const meta = cardMeta(card);
>>>>>>> origin/main
            return (
              <Card key={card.id} className="jb-lift" data-testid="seeker-match-card">
                <div className="flex gap-4 px-4">
                  <div className="flex size-14 flex-none items-center justify-center rounded-xl bg-accent font-heading text-lg font-semibold text-accent-foreground">
                    {(card.company ?? card.title).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/seeker/matches/${card.id}`}
                          className="font-heading text-base font-medium leading-snug tracking-tight text-foreground hover:underline"
                        >
                          {card.title}
                        </Link>
                        <Badge variant={BAND_VARIANT[card.band]}>{BAND_LABEL[card.band]}</Badge>
                        <Badge
                          className="ml-auto"
                          variant={
                            card.status === "revealed"
                              ? "default"
                              : card.status === "interested"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {card.pendingOverride
                            ? "Revealed — respond above"
                            : card.status.charAt(0).toUpperCase() + card.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{meta}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {card.status === "surfaced" && <MatchResponseButtons matchId={card.id} />}
                      {card.status === "interested" && (
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={`/seeker/matches/${card.id}`} />}
                        >
                          View details
                        </Button>
                      )}
                      {card.status === "revealed" && !card.pendingOverride && card.threadId && (
                        <Button size="sm" render={<Link href={`/thread/${card.threadId}`} />}>
                          Message recruiter
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
