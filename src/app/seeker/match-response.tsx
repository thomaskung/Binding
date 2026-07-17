"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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
        I&apos;m interested
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
