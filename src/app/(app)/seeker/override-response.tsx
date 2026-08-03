"use client";

import { useState, useTransition } from "react";
import { Button } from "@binding/ui";
import { respondToOverride } from "./actions";

export function OverrideResponseButtons({ revealId }: { revealId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(response: "accepted" | "declined") {
    startTransition(async () => {
      try {
        await respondToOverride(revealId, response);
      } catch (e) {
        setError(e instanceof Error ? e.message : "response failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={pending} data-testid="override-accept" onClick={() => respond("accepted")}>
        Accept conversation
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        data-testid="override-decline"
        onClick={() => respond("declined")}
      >
        Decline
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
