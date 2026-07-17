"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revealCandidate } from "../../../actions";

export function RevealButton({ matchId }: { matchId: string }) {
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
        Reveal candidate (10 pts)
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
