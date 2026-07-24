"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@jumponboard/ui";
import { OverrideButton, RevealButton } from "./reveal-button";

export interface RecruiterMatchCard {
  id: string;
  profileId: string;
  score: number;
  status: "surfaced" | "interested" | "declined" | "revealed";
  revealedName: string | null;
  fitSummary: string | null;
  text: string;
  overridePending: boolean;
  overrideDeclined: boolean;
  overrideAllowed: boolean;
  overrideReason: string | null;
  threadOpen: boolean;
  threadId: string | null;
}

const STATUS_FILTERS = ["all", "surfaced", "interested", "revealed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SortKey = "match" | "recent";
const SORT_LABEL: Record<SortKey, string> = { match: "Best match", recent: "Most recent" };

export function MatchList({ cards }: { cards: RecruiterMatchCard[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("match");

  // "recent" falls back to the server's original order (already newest-first
  // isn't guaranteed here — cards arrive score-sorted; index stands in for
  // recency since createdAt isn't part of this card's data).
  const visible = useMemo(() => {
    const filtered =
      statusFilter === "all" ? cards : cards.filter((c) => c.status === statusFilter);
    if (sortBy === "match") return [...filtered].sort((a, b) => b.score - a.score);
    return filtered;
  }, [cards, statusFilter, sortBy]);

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No matches yet. Publish the job (with an embedded JD) and check back
          as candidates join the pool.
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
            <SelectItem value="recent">Most recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No candidates in this filter.
          </CardContent>
        </Card>
      ) : (
        visible.map((card) => (
          <Card className="jb-lift" key={card.id} data-testid="recruiter-match-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg">
                {card.status === "revealed" && card.revealedName ? (
                  <span data-testid="revealed-name">{card.revealedName}</span>
                ) : (
                  <span className="text-muted-foreground">Pseudonymized candidate</span>
                )}
                <Badge variant="outline">{Math.round(card.score * 100)}% match</Badge>
                <Badge
                  variant={
                    card.status === "interested"
                      ? "default"
                      : card.status === "revealed"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {card.overridePending
                    ? "revealed — awaiting response"
                    : card.overrideDeclined
                      ? "revealed — declined"
                      : card.status}
                </Badge>
              </CardTitle>
              {card.status === "revealed" && card.fitSummary && (
                <CardDescription data-testid="fit-summary">{card.fitSummary}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">
                {card.text || "(profile text unavailable)"}
              </p>
              {card.status === "interested" && <RevealButton matchId={card.id} />}
              {card.status === "surfaced" &&
                (card.overrideAllowed ? (
                  <OverrideButton matchId={card.id} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Waiting for the candidate to express interest.
                    {card.overrideReason ? ` Override unavailable: ${card.overrideReason}.` : ""}
                  </p>
                ))}
              {card.overridePending && (
                <p className="text-xs text-muted-foreground" data-testid="override-pending-note">
                  Identity disclosed. Messaging stays locked until the candidate accepts —
                  they have 7 days; if they decline or it expires, 15 pts refund automatically.
                </p>
              )}
              {card.overrideDeclined && (
                <p className="text-xs text-muted-foreground" data-testid="override-declined-note">
                  Candidate declined the conversation. Your 15-pt premium was refunded; this
                  candidate can&apos;t be override-revealed again for 30 days.
                </p>
              )}
              {card.status === "revealed" && card.threadOpen && card.threadId && (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="open-thread"
                  render={<Link href={`/thread/${card.threadId}`} />}
                >
                  Open conversation
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
