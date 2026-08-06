"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from "@binding/ui";
import { candidateLabel, seniorityChip } from "@/lib/candidate-card";
import { relativeTime } from "@/lib/time";

export interface RecruiterMatchCard {
  id: string;
  profileId: string;
  score: number;
  status: "surfaced" | "interested" | "declined" | "revealed";
  revealedName: string | null;
  fitSummary: string | null;
  text: string;
  // Strength signals (non-identifying, from match_candidates RPC)
  seniorityBand: string | null;
  yearsExperience: number | null;
  skills: string[];
  industries: string[];
  desiredRoles: string[];
  region: string | null;
  credentialsSummary: string | null;
  interestedAt: string | null;
  revealCost: number;
  overrideRefund: number;
  revealRequestId: string | null;
  overridePending: boolean;
  overrideDeclined: boolean;
  overrideAllowed: boolean;
  overrideReason: string | null;
  threadOpen: boolean;
  threadId: string | null;
}

const STATUS_FILTERS = ["all", "surfaced", "interested", "revealed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All statuses",
  surfaced: "Surfaced",
  interested: "Interested",
  revealed: "Revealed",
};

type SortKey = "match" | "recent";
const SORT_LABEL: Record<SortKey, string> = { match: "Best match", recent: "Most recent" };

const MIN_PCT_FLOOR = 55;

function statusBadge(card: RecruiterMatchCard) {
  if (card.overridePending) return "revealed — awaiting response";
  if (card.overrideDeclined) return "revealed — declined";
  return card.status;
}

export function MatchList({
  cards,
  selectedId,
  onSelect,
}: {
  cards: RecruiterMatchCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("match");
  const [minPct, setMinPct] = useState<number>(70); // opens on stronger fits; drag down to widen
  const [interestedOnly, setInterestedOnly] = useState(false);

  const visible = useMemo(() => {
    const filtered = cards.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (interestedOnly && !c.interestedAt) return false;
      if (Math.round(c.score * 100) < minPct) return false;
      return true;
    });
    if (sortBy === "match") return [...filtered].sort((a, b) => b.score - a.score);
    // Most recent: interested_at desc, NULLs last.
    return [...filtered].sort((a, b) => {
      const ta = a.interestedAt ? Date.parse(a.interestedAt) : -Infinity;
      const tb = b.interestedAt ? Date.parse(b.interestedAt) : -Infinity;
      return tb - ta;
    });
  }, [cards, statusFilter, sortBy, minPct, interestedOnly]);

  if (cards.length === 0) {
    return (
      <Card className="jb-fade">
        <CardContent className="py-10 text-center text-muted-foreground">
          No matches yet. Publish the job (with an embedded JD) and check back as candidates join
          the pool.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="jb-fade space-y-4">
      {/* Filter + sort bar (one place for both) */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger style={{ width: 150 }} data-testid="filter-status">
            <SelectValue>{STATUS_LABEL[statusFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-40 flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Min match {minPct}%
          </span>
          <Slider
            value={minPct}
            onValueChange={(v) => setMinPct(v as number)}
            min={MIN_PCT_FLOOR}
            max={100}
            step={5}
            data-testid="filter-min-pct"
          />
        </div>

        <Button
          size="sm"
          variant={interestedOnly ? "default" : "outline"}
          aria-pressed={interestedOnly}
          onClick={() => setInterestedOnly((v) => !v)}
          data-testid="filter-interested"
        >
          Interested only
        </Button>

        <div className="ml-auto">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger style={{ width: 150 }} data-testid="sort-by">
              <SelectValue>{SORT_LABEL[sortBy]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">Best match</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="jb-fade">
          <CardContent className="py-10 text-center text-muted-foreground">
            No candidates match this filter. Try lowering the minimum match.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((card) => {
            const label =
              card.status === "revealed" && card.revealedName
                ? card.revealedName
                : candidateLabel(card);
            const senChip = seniorityChip(card.seniorityBand, card.yearsExperience);
            const interest = relativeTime(card.interestedAt);
            return (
              <Card
                key={card.id}
                data-testid="recruiter-match-card"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(card.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(card.id);
                  }
                }}
                className={`jb-lift cursor-pointer ${
                  selectedId === card.id ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <CardContent className="flex items-start gap-4">
                  {/* Exact % match — recruiter-only (raw score never reaches
                      seeker code). Soft-tint tile mirrors the mockup's score
                      chip; accent-foreground keeps it AA in both themes. */}
                  <div className="flex size-[52px] flex-none flex-col items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <span className="jb-serif text-lg font-semibold leading-none" data-testid="match-pct">
                      {Math.round(card.score * 100)}%
                    </span>
                    <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide opacity-70">
                      match
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="truncate font-heading text-[15px] font-semibold leading-snug tracking-tight"
                        data-testid={
                          card.status === "revealed" && card.revealedName
                            ? "revealed-name"
                            : "candidate-label"
                        }
                      >
                        {label}
                      </p>
                      <Badge
                        variant={
                          card.status === "interested"
                            ? "default"
                            : card.status === "revealed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {statusBadge(card)}
                      </Badge>
                      <span
                        className="ml-auto text-[12px] font-medium text-muted-foreground"
                        data-testid="reveal-cost"
                      >
                        reveal {card.revealCost} pts
                      </span>
                    </div>
                    {interest && (
                      <p className="text-[12px] text-muted-foreground">interested {interest}</p>
                    )}

                    {/* Strength chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {senChip && <Badge variant="secondary">{senChip}</Badge>}
                      {card.region && <Badge variant="secondary">{card.region}</Badge>}
                      {card.industries.slice(0, 1).map((ind) => (
                        <Badge key={ind} variant="secondary">
                          {ind}
                        </Badge>
                      ))}
                      {card.skills.slice(0, 4).map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                      {card.skills.length > 4 && (
                        <Badge variant="outline">+{card.skills.length - 4}</Badge>
                      )}
                      {card.credentialsSummary && (
                        <Badge variant="default" data-testid="credentials-chip">
                          ★ {card.credentialsSummary}
                        </Badge>
                      )}
                    </div>

                    <span className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                      View details →
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
