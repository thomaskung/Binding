"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, Progress } from "@binding/ui";
import { candidateLabel, seniorityChip } from "@/lib/candidate-card";
import { experienceRatio, skillsOverlapRatio } from "@/lib/candidate-scoring";
import { CompareConfirmDialog } from "./compare-confirm-dialog";
import type { RecruiterMatchCard } from "./match-list";

const REVEAL_ELIGIBLE_STATUSES: RecruiterMatchCard["status"][] = ["interested", "surfaced"];
function isRevealEligible(status: RecruiterMatchCard["status"]): boolean {
  return REVEAL_ELIGIBLE_STATUSES.includes(status);
}

/** Compare mode: a selectable grid for reviewing several candidates side by
 * side, then revealing several at once. Deliberately doesn't share List
 * mode's filter bar (status/min%/sort) — accepted scope cut, matches mockup
 * fidelity. No "pay fit" bar: candidate salary expectations stay hidden from
 * recruiters even post-reveal (two-sided salary stealth, BUSINESS.md), and
 * every surfaced candidate already cleared the dealbreaker filter, so a
 * numeric pay-fit bar would be fake or a constant 100%. */
export function CompareView({
  cards,
  jobSkills,
}: {
  cards: RecruiterMatchCard[];
  jobSkills: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Bumped on each open so CompareConfirmDialog remounts fresh — reset by
  // construction instead of a setState-in-effect reset.
  const [dialogKey, setDialogKey] = useState(0);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      <p className="text-[13px] text-muted-foreground">
        Weigh skills, experience, and fit together, then reveal several candidates at once.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const label =
            card.status === "revealed" && card.revealedName ? card.revealedName : candidateLabel(card);
          const senChip = seniorityChip(card.seniorityBand, card.yearsExperience);
          const eligible = isRevealEligible(card.status);
          const selected = selectedIds.has(card.id);
          const skillsOverlap = skillsOverlapRatio(jobSkills, card.skills);
          const experience = experienceRatio(card.yearsExperience);

          return (
            <Card
              key={card.id}
              data-testid="compare-candidate-card"
              className={`jb-lift ${selected ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 flex-none flex-col items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <span className="jb-serif text-base font-semibold leading-none">
                      {Math.round(card.score * 100)}%
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-[14px] font-semibold leading-snug tracking-tight">
                      {label}
                    </p>
                    <Badge variant={card.status === "interested" ? "default" : "outline"}>
                      {card.status}
                    </Badge>
                  </div>
                  {eligible && (
                    <Button
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() => toggle(card.id)}
                      data-testid="compare-select-toggle"
                    >
                      {selected ? "Selected" : "Select"}
                    </Button>
                  )}
                </div>

                {senChip && <Badge variant="secondary">{senChip}</Badge>}

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Overall match</span>
                      <span>{Math.round(card.score * 100)}%</span>
                    </div>
                    <Progress value={card.score * 100} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Skills overlap</span>
                      <span>{Math.round(skillsOverlap * 100)}%</span>
                    </div>
                    <Progress value={skillsOverlap * 100} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Experience</span>
                      <span>{Math.round(experience * 100)}%</span>
                    </div>
                    <Progress value={experience * 100} className="h-1.5" />
                  </div>
                </div>

                {!eligible && (
                  <p className="text-[11px] text-muted-foreground">
                    {card.status === "revealed" ? "Already revealed." : "Declined."}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            onClick={() => {
              setDialogKey((k) => k + 1);
              setConfirmOpen(true);
            }}
            data-testid="compare-reveal-selected"
          >
            Reveal selected ({selectedIds.size})
          </Button>
        </div>
      )}

      <CompareConfirmDialog
        key={dialogKey}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        matchIds={Array.from(selectedIds)}
        cardsById={cardsById}
        onDone={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
