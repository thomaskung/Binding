"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Progress } from "@binding/ui";
import { respondToMatch } from "./actions";
import { BAND_LABEL, BAND_VARIANT, cardMeta, type SeekerMatchCard } from "./match-list";

export interface FocusReviewProps {
  cards: SeekerMatchCard[];
  onExit: () => void;
}

function surfacedCards(cards: SeekerMatchCard[]): SeekerMatchCard[] {
  return cards.filter((card) => card.status === "surfaced");
}

export function FocusReview({ cards, onExit }: FocusReviewProps) {
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const [pending, startTransition] = useTransition();

  // Compute surfaced subset once on mount, not reactively from cards prop —
  // deliberately frozen so a mid-review respondToMatch() doesn't shrink/reorder
  // the set out from under the cursor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const surfaced = useMemo(() => surfacedCards(cards), []);

  // Completion screen shown when cursor exhausts the set
  const isComplete = cursor >= surfaced.length;

  // Current card (undefined if complete)
  const currentCard = surfaced[cursor];

  const handleAction = (matchId: string, response: "interested" | "declined") => {
    startTransition(async () => {
      await respondToMatch(matchId, response);
      if (response === "interested") {
        setInterestedCount((c) => c + 1);
      }
      // Advance to next card
      setCursor((c) => c + 1);
    });
  };

  const handleExit = () => {
    // Refresh the parent list view to reflect changes
    router.refresh();
    onExit();
  };

  const handleExitFromCompletion = () => {
    router.refresh();
    onExit();
  };

  if (isComplete) {
    return (
      <Card className="jb-fade">
        <div className="space-y-6 px-6 py-10 text-center">
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">Review complete</h2>
            <p className="text-sm text-muted-foreground">
              You marked {interestedCount} {interestedCount === 1 ? "match" : "matches"} as interested
            </p>
          </div>
          <Button onClick={handleExitFromCompletion}>Back to matches</Button>
        </div>
      </Card>
    );
  }

  if (!currentCard) {
    return (
      <Card className="jb-fade">
        <div className="px-4 py-10 text-center text-muted-foreground">
          No surfaced matches to review.
        </div>
      </Card>
    );
  }

  const progressPercent = Math.round(((cursor + 1) / surfaced.length) * 100);

  return (
    <div className="jb-fade space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            {cursor + 1} of {surfaced.length}
          </div>
          <Progress value={progressPercent} className="mt-2" />
        </div>
        <Button size="sm" variant="ghost" onClick={handleExit} disabled={pending}>
          Close
        </Button>
      </div>

      <Card className="jb-lift">
        <div className="flex gap-4 px-6">
          <div className="flex size-16 flex-none items-center justify-center rounded-xl bg-accent font-heading text-lg font-semibold text-accent-foreground">
            {(currentCard.company ?? currentCard.title).charAt(0).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4 py-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-medium text-foreground">
                {currentCard.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={BAND_VARIANT[currentCard.band]}>
                  {BAND_LABEL[currentCard.band]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{cardMeta(currentCard)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => handleAction(currentCard.id, "interested")}
              >
                I&apos;m interested
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => handleAction(currentCard.id, "declined")}
              >
                Not for me
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
