"use client";

import { useTransition } from "react";
import { Button } from "@jumponboard/ui";
import { respondToMatch } from "./actions";

export function MatchResponseButtons({ matchId }: { matchId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        data-testid="match-interested"
        onClick={() => startTransition(() => respondToMatch(matchId, "interested"))}
      >
        Express interest
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => respondToMatch(matchId, "declined"))}
      >
        Not for me
      </Button>
    </div>
  );
}
