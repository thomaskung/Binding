"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@binding/ui";
import { candidateLabel } from "@/lib/candidate-card";
import {
  bulkRevealCandidates,
  previewBulkRevealCost,
  type BulkRevealOutcome,
  type BulkRevealPreview,
} from "../../../actions";
import type { RecruiterMatchCard } from "./match-list";

/** Bulk-reveal confirmation: fetches an authoritative read-only cost preview
 * (previewBulkRevealCost — no charge) before the user commits, then commits
 * via bulkRevealCandidates and shows the real per-candidate outcomes, which
 * can differ from the preview if a daily cap trips mid-batch.
 *
 * The caller remounts this component (a fresh `key`) each time it opens for
 * a new selection, so preview/outcomes/error reset by construction rather
 * than via a synchronous setState-in-effect reset. */
export function CompareConfirmDialog({
  open,
  onOpenChange,
  matchIds,
  cardsById,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchIds: string[];
  cardsById: Map<string, RecruiterMatchCard>;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<BulkRevealPreview[] | null>(null);
  const [outcomes, setOutcomes] = useState<BulkRevealOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matchIdsKey = matchIds.join(",");

  useEffect(() => {
    if (!open || matchIds.length === 0) return;
    startTransition(async () => {
      try {
        const result = await previewBulkRevealCost(matchIds);
        setPreview(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to preview cost");
      }
    });
    // matchIdsKey is the stable dep; matchIds itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matchIdsKey]);

  const totalCost = (preview ?? []).reduce((sum, p) => sum + (p.cost ?? 0), 0);

  const confirm = () => {
    startTransition(async () => {
      try {
        const result = await bulkRevealCandidates(matchIds);
        setOutcomes(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "bulk reveal failed");
      }
    });
  };

  const close = () => {
    onOpenChange(false);
    if (outcomes) onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="compare-confirm-dialog">
        <DialogHeader>
          <DialogTitle>
            {outcomes ? "Reveal results" : `Reveal ${matchIds.length} candidate${matchIds.length === 1 ? "" : "s"}?`}
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!outcomes && preview && (
          <div className="space-y-2">
            {preview.map((p) => {
              const card = cardsById.get(p.matchId);
              return (
                <div key={p.matchId} className="flex items-center justify-between text-[13px]">
                  <span className="truncate">{card ? candidateLabel(card) : p.matchId}</span>
                  <span data-testid="compare-preview-cost">
                    {p.cost !== undefined ? `${p.cost} pts` : p.reason}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t pt-2 text-[13px] font-semibold">
              <span>Total</span>
              <span data-testid="compare-preview-total">{totalCost} pts</span>
            </div>
          </div>
        )}

        {outcomes && (
          <div className="space-y-2">
            {outcomes.map((o) => {
              const card = cardsById.get(o.matchId);
              return (
                <div key={o.matchId} className="flex items-center justify-between text-[13px]">
                  <span className="truncate">{card ? candidateLabel(card) : o.matchId}</span>
                  <span data-testid="compare-outcome">
                    {o.outcome === "revealed"
                      ? `revealed — ${o.cost} pts`
                      : `${o.outcome}${o.reason ? `: ${o.reason}` : ""}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          {!outcomes ? (
            <>
              <Button variant="outline" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={confirm} disabled={pending || !preview} data-testid="compare-confirm-reveal">
                Confirm reveal
              </Button>
            </>
          ) : (
            <Button onClick={close} data-testid="compare-confirm-done">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
