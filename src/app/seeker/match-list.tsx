"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MatchBand } from "@/lib/matching";
import { MatchResponseButtons } from "./match-response";

export interface SeekerMatchCard {
  id: string;
  title: string;
  company: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  workSetups: string[];
  status: "surfaced" | "interested" | "declined" | "revealed";
  band: MatchBand;
  /** Ordinal position by true score, 1 = best. Never the raw score itself —
   * lets "best match" sort work without exposing exact cosine similarity. */
  rank: number;
  pendingOverride: boolean;
  threadId: string | null;
}

const BAND_LABEL: Record<MatchBand, string> = {
  high: "High match",
  normal: "Normal match",
  low: "Low match",
};
const BAND_VARIANT: Record<MatchBand, "default" | "secondary" | "outline"> = {
  high: "default",
  normal: "secondary",
  low: "outline",
};

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
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No matches yet. Matches appear when an active job aligns with your
          skills and dealbreakers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="surfaced">Surfaced</TabsTrigger>
            <TabsTrigger value="interested">Interested</TabsTrigger>
            <TabsTrigger value="revealed">Revealed</TabsTrigger>
          </TabsList>
        </Tabs>
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
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No matches in this filter.
          </CardContent>
        </Card>
      ) : (
        visible.map((card) => (
          <Card key={card.id} data-testid="seeker-match-card">
            <CardHeader>
              <CardTitle>
                {card.title}
                {card.company ? (
                  <span className="text-muted-foreground font-normal"> · {card.company}</span>
                ) : null}
              </CardTitle>
              <CardDescription>{card.workSetups.join(" / ")}</CardDescription>
              <CardAction>
                <Badge variant={BAND_VARIANT[card.band]}>{BAND_LABEL[card.band]}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-lg font-semibold tracking-tight">
                    {card.salaryMin != null && card.salaryMax != null
                      ? `$${card.salaryMin.toLocaleString()} – $${card.salaryMax.toLocaleString()}`
                      : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">Base salary range</span>
                </div>
                <Badge
                  variant={
                    card.status === "interested"
                      ? "default"
                      : card.status === "revealed"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {card.pendingOverride
                    ? "revealed — respond above"
                    : card.status}
                </Badge>
              </div>
            </CardContent>
            <CardFooter>
              {card.status === "surfaced" && <MatchResponseButtons matchId={card.id} />}
              {card.status === "revealed" && !card.pendingOverride && card.threadId && (
                <Button size="sm" variant="secondary" render={<Link href={`/thread/${card.threadId}`} />}>
                  Open conversation
                </Button>
              )}
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
