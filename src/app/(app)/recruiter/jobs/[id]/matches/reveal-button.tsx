"use client";

import { useState, useTransition } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@binding/ui";
import { overrideRevealCandidate, revealCandidate } from "../../../actions";

export function RevealButton({ matchId, cost = 10 }: { matchId: string; cost?: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await revealCandidate(matchId);
        setDialogOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "reveal failed");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          data-testid="reveal-candidate"
          onClick={() => setDialogOpen(true)}
        >
          Reveal candidate ({cost} pts)
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reveal candidate?</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">
            This will cost {cost} pts. Confirm to reveal this candidate&apos;s identity and details.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={pending} data-testid="confirm-reveal">
              Confirm reveal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await overrideRevealCandidate(matchId);
        setDialogOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "override failed");
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="override-candidate"
          onClick={() => setDialogOpen(true)}
        >
          Reveal now ({cost} pts — hasn&apos;t opted in)
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reveal candidate without consent?</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will cost {cost} pts to disclose their identity immediately.
            </p>
            <p className="text-[12px] text-muted-foreground">
              {refund} pts refund if they decline or don&apos;t respond in 7 days. Candidate is compensated
              either way.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={pending} data-testid="confirm-override">
              Confirm reveal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
