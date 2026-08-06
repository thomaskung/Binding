"use client";

import { useState, useTransition } from "react";
import { Button } from "@binding/ui";
import { overrideRevealCandidate, revealCandidate } from "../../../actions";

export function RevealButton({ matchId, cost = 10 }: { matchId: string; cost?: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        disabled={pending}
        data-testid="reveal-candidate"
        onClick={() =>
          startTransition(async () => {
            try {
              await revealCandidate(matchId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "reveal failed");
            }
          })
        }
      >
        Reveal candidate ({cost} pts)
      </Button>
      {error && <p className="jb-fade text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function OverrideButton({
  matchId,
  cost = 25,
  refund = 15,
}: {
  matchId: string;
  cost?: number;
  refund?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="override-candidate"
          onClick={() =>
            startTransition(async () => {
              try {
                await overrideRevealCandidate(matchId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "override failed");
              }
            })
          }
        >
          Reveal now ({cost} pts — hasn&apos;t opted in)
        </Button>
        {error && <p className="jb-fade text-sm text-destructive">{error}</p>}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {refund} pts refund if they decline or don&apos;t respond in 7 days. Candidate is compensated
        either way.
      </p>
    </div>
  );
}
