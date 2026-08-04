"use client";

import Link from "next/link";
import { Badge, Button, Separator } from "@binding/ui";
import { candidateLabel, seniorityChip } from "@/lib/candidate-card";
import { relativeTime } from "@/lib/time";
import type { RecruiterMatchCard } from "./match-list";
import { OverrideButton, RevealButton } from "./reveal-button";

/** The detail pane that pops out to the right (desktop) / as a drawer
 * (mobile). Pre-reveal: full strength detail + reveal actions. Post-reveal:
 * real name + fit summary + full structured profile + redacted-résumé PDF.
 * NO salary at any point (fairness — the recruiter hasn't shared the budget). */
export function CandidatePanel({ card, onClose }: { card: RecruiterMatchCard; onClose: () => void }) {
  const revealed = card.status === "revealed";
  const interest = relativeTime(card.interestedAt);
  const senChip = seniorityChip(card.seniorityBand, card.yearsExperience);

  return (
    <div className="rounded-lg border bg-card p-5" data-testid="candidate-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">
            {revealed && card.revealedName ? (
              <span data-testid="panel-revealed-name">{card.revealedName}</span>
            ) : (
              candidateLabel(card)
            )}
          </h2>
          {interest && <p className="text-xs text-muted-foreground">interested {interest}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close" data-testid="panel-close">
          ✕
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Badge variant="outline">{Math.round(card.score * 100)}% match</Badge>
        {!revealed && <Badge variant="secondary">reveal {card.revealCost} pts</Badge>}
      </div>

      {/* Strength chips (always visible — the pitch for revealing) */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {senChip && <Badge variant="secondary">{senChip}</Badge>}
        {card.region && <Badge variant="secondary">{card.region}</Badge>}
        {card.industries.map((ind) => (
          <Badge key={ind} variant="secondary">
            {ind}
          </Badge>
        ))}
        {card.skills.map((s) => (
          <Badge key={s} variant="outline">
            {s}
          </Badge>
        ))}
        {card.credentialsSummary && (
          <Badge variant="default" data-testid="panel-credentials">
            ★ {card.credentialsSummary}
          </Badge>
        )}
      </div>

      <Separator className="my-4" />

      {revealed ? (
        <div className="space-y-4">
          {card.fitSummary && (
            <section>
              <h3 className="text-sm font-medium">Why they fit</h3>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="fit-summary">
                {card.fitSummary}
              </p>
            </section>
          )}
          <section>
            <h3 className="text-sm font-medium">Profile</h3>
            <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
              {card.text || "(profile text unavailable)"}
            </p>
          </section>
          {card.revealRequestId && (
            <Button
              size="sm"
              variant="secondary"
              data-testid="download-resume"
              render={
                <a
                  href={`/api/resume-pdf/${card.revealRequestId}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Download résumé (PDF)
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Contact details are stripped from the résumé; salary expectations are withheld until you
            share the role&apos;s budget.
          </p>
          {card.threadOpen && card.threadId && (
            <Button
              size="sm"
              data-testid="open-thread"
              render={<Link href={`/thread/${card.threadId}`} />}
            >
              Open conversation
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <section>
            <h3 className="text-sm font-medium">Profile summary</h3>
            <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
              {card.text || "(profile text unavailable)"}
            </p>
          </section>

          {card.status === "interested" && <RevealButton matchId={card.id} />}
          {card.status === "surfaced" &&
            (card.overrideAllowed ? (
              <OverrideButton matchId={card.id} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for the candidate to express interest.
                {card.overrideReason ? ` Override unavailable: ${card.overrideReason}.` : ""}
              </p>
            ))}
          {card.overridePending && (
            <p className="text-xs text-muted-foreground" data-testid="override-pending-note">
              Identity disclosed. Messaging stays locked until the candidate accepts — they have 7
              days; if they decline or it expires, 15 pts refund automatically.
            </p>
          )}
          {card.overrideDeclined && (
            <p className="text-xs text-muted-foreground" data-testid="override-declined-note">
              Candidate declined the conversation. Your 15-pt premium was refunded; this candidate
              can&apos;t be override-revealed again for 30 days.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
