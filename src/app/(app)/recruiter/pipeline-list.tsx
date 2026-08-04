"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@binding/ui";
import { candidateLabel, seniorityChip } from "@/lib/candidate-card";

export interface PipelineCard {
  id: string;
  jobId: string;
  jobTitle: string;
  score: number;
  status: "surfaced" | "interested" | "declined" | "revealed";
  revealedName: string | null;
  text: string;
  // Strength signals (non-identifying, from match_candidates RPC)
  seniorityBand: string | null;
  yearsExperience: number | null;
  skills: string[];
  industries: string[];
  desiredRoles: string[];
  region: string | null;
  credentialsSummary: string | null;
  threadId: string | null;
}

const STATUS_FILTERS = ["all", "surfaced", "interested", "revealed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SortKey = "match" | "title";
const SORT_LABEL: Record<SortKey, string> = { match: "Best match", title: "Role A–Z" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  surfaced: "outline",
  interested: "secondary",
  revealed: "default",
};

/** Aggregate candidate pipeline (RecruiterMatchDashboard template): every
 * match across the recruiter's open roles, filter + sort + status, with the
 * costly reveal/override actions living on the per-job matches page. */
export function PipelineList({ cards }: { cards: PipelineCard[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("match");

  const visible = useMemo(() => {
    const filtered =
      statusFilter === "all"
        ? cards.filter((c) => c.status !== "declined")
        : cards.filter((c) => c.status === statusFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "title") return a.jobTitle.localeCompare(b.jobTitle);
      return b.score - a.score;
    });
  }, [cards, statusFilter, sortBy]);

  return (
    <div className="space-y-5">
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
            <SelectItem value="title">Role A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4">
        {visible.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No candidates in this filter.
          </div>
        )}
        {visible.map((card) => {
          const label = card.revealedName ?? candidateLabel(card);
          const senChip = seniorityChip(card.seniorityBand, card.yearsExperience);
          return (
          <Card key={card.id} data-testid="pipeline-card">
            <CardHeader>
              <CardTitle data-testid={card.revealedName ? "pipeline-revealed-name" : "pipeline-label"}>
                {label} <span className="font-normal text-muted-foreground">— {card.jobTitle}</span>
              </CardTitle>
              <CardAction>
                <Badge variant="secondary">{Math.round(card.score * 100)}% match</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {senChip && <Badge variant="secondary">{senChip}</Badge>}
                {card.region && <Badge variant="secondary">{card.region}</Badge>}
                {card.industries.slice(0, 1).map((ind) => (
                  <Badge key={ind} variant="secondary">{ind}</Badge>
                ))}
                {card.skills.slice(0, 4).map((s) => (
                  <Badge key={s} variant="outline">{s}</Badge>
                ))}
                {card.skills.length > 4 && <Badge variant="outline">+{card.skills.length - 4}</Badge>}
                {card.credentialsSummary && (
                  <Badge variant="default" data-testid="pipeline-credentials">★ {card.credentialsSummary}</Badge>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[card.status] ?? "outline"}>
                {card.status.charAt(0).toUpperCase() + card.status.slice(1)}
              </Badge>
            </CardContent>
            <CardFooter>
              {card.status === "revealed" && card.threadId ? (
                <Button size="sm" render={<Link href={`/thread/${card.threadId}`} />}>
                  Message candidate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={card.status === "interested" ? "default" : "outline"}
                  render={<Link href={`/recruiter/jobs/${card.jobId}/matches`} />}
                >
                  {card.status === "interested" ? "Reveal profile" : "View profile"}
                </Button>
              )}
            </CardFooter>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
