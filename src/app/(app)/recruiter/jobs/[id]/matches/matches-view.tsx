"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@binding/ui";
import { CandidatePanel } from "./candidate-panel";
import { MatchList, type RecruiterMatchCard } from "./match-list";

/** Wraps the list + detail panel with selection state. Desktop: split view
 * (list left, panel pops out to the right, sticky). Mobile (<1024px): the
 * panel opens as a full-screen drawer/overlay. */
export function MatchesView({ cards }: { cards: RecruiterMatchCard[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Selection may point at a card that got filtered out client-side; the panel
  // simply closes if the id is no longer in the set.
  const selected = cards.find((c) => c.id === selectedId) ?? null;
  const close = () => setSelectedId(null);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <MatchList cards={cards} selectedId={selectedId} onSelect={setSelectedId} />

      {/* Desktop: inline right-hand panel (pops out to the right). */}
      {isDesktop && (
        <div className="sticky top-6 hidden lg:block">
          {selected ? (
            <CandidatePanel card={selected} onClose={close} />
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Select a candidate to see their strengths and reveal options.
            </div>
          )}
        </div>
      )}

      {/* Mobile: full-screen drawer. */}
      {!isDesktop && (
        <Dialog open={!!selected} onOpenChange={(o) => !o && close()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">Candidate detail</DialogTitle>
            {selected && <CandidatePanel card={selected} onClose={close} />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
