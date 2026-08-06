"use client"

import { ShieldCheck } from "lucide-react"

import { Button } from "./button"
import { Card } from "./card"
import { cn } from "./utils"

/**
 * Resolution state of a reveal request. The card is fully controlled and
 * never changes this itself — the parent screen owns the mutation (points
 * ledger, RLS-gated disclosure, refunds, …) and re-renders with the new
 * status once it settles.
 */
export type RevealRequestStatus = "pending" | "accepted" | "declined"

/**
 * Optional overrides for the accept/decline button `data-testid`s, so a
 * screen that already has e2e specs pinned to specific ids can reuse this
 * card without breaking them. Example: the seeker override-reveal surface
 * (`src/app/(app)/seeker/override-response.tsx`) has e2e specs selecting on
 * `override-accept` / `override-decline` — pass
 * `testIds={{ accept: "override-accept", decline: "override-decline" }}`
 * when wiring this card in there instead of the defaults below.
 */
export interface RevealRequestCardTestIds {
  accept?: string
  decline?: string
}

export interface RevealRequestCardProps {
  /** Small uppercase eyebrow above the headline, e.g. `"Reveal request · 2h ago"`. */
  eyebrow: string
  /** One-line headline, e.g. `"A recruiter wants to reveal your profile"`. */
  headline: string
  /** Supporting sentence naming the requester/context (job, company, candidate, …). */
  body: string
  /** What becomes visible on accept — rendered in the "They'll see" column. */
  shares: string
  /** What stays hidden no matter the outcome — rendered in the "Stays hidden" column. */
  withheld: string
  /** Points credited to the recipient on acceptance. Drives the accept CTA label
   * (`"Accept · +{rewardPoints} pts"`) and the default resolved-accepted copy. */
  rewardPoints: number
  /** Extra points for accepting within the response window. Only rendered — together
   * with `bonusWindowLabel` — when both are supplied; a standard (non-time-bounded)
   * reveal simply omits them. */
  bonusPoints?: number
  /** Human-readable response window for the bonus, e.g. `"24h"`. See `bonusPoints`. */
  bonusWindowLabel?: string
  /** Current resolution state. `"pending"` renders the accept/decline actions;
   * `"accepted"` / `"declined"` render the resolved banner in place. */
  status: RevealRequestStatus
  /** True while accept/decline is in flight (e.g. inside the caller's `useTransition`);
   * disables both action buttons so a slow network can't double-submit. */
  pending?: boolean
  /** Called when the recipient accepts. The card never performs the mutation itself. */
  onAccept: () => void
  /** Called when the recipient declines. The card never performs the mutation itself. */
  onDecline: () => void
  /** Optional "Review details" affordance (e.g. open the full job/candidate view).
   * Omitted from the actions row entirely when not provided. */
  onReviewDetails?: () => void
  /** Overrides the resolved-state message. Defaults to a reward-aware "Accepted" line
   * or a generic "Declined" line — pass this when the caller's flow has extra specifics
   * the card can't infer (e.g. an override reveal's 15-pt premium refund on decline). */
  resolutionText?: string
  /** Footer assurance copy. Defaults to the standard identity-gating disclosure;
   * override only for wording, never to weaken the guarantee it states. */
  assuranceNote?: string
  /** See {@link RevealRequestCardTestIds}. */
  testIds?: RevealRequestCardTestIds
  className?: string
}

const DEFAULT_ASSURANCE_NOTE =
  "Name and contact stay hidden until acceptance — that rule can't be turned off."

/**
 * Consent-gated disclosure card: a shares-vs-withheld split, a points reward
 * on accept, an optional time-bounded bonus, and a decline that's always
 * free. Resolves in place — the actions row swaps for a resolved banner once
 * `status` moves off `"pending"`.
 *
 * Presentational only: no data fetching, no server actions, no points/refund
 * math. The caller supplies copy + status via props and reacts to
 * `onAccept`/`onDecline`.
 *
 * Deliberately not ported from the design source (`RevealRequestCard.dc.html`):
 * its "Reset demo" affordance, which only existed to let the static mockup
 * loop between states — a real card is driven by `status` from the caller
 * and never resets itself.
 */
export function RevealRequestCard({
  eyebrow,
  headline,
  body,
  shares,
  withheld,
  rewardPoints,
  bonusPoints,
  bonusWindowLabel,
  status,
  pending = false,
  onAccept,
  onDecline,
  onReviewDetails,
  resolutionText,
  assuranceNote = DEFAULT_ASSURANCE_NOTE,
  testIds,
  className,
}: RevealRequestCardProps) {
  const isPending = status === "pending"
  const resolved =
    resolutionText ??
    (status === "accepted"
      ? `Accepted — your details are now visible. +${rewardPoints} pts credited.`
      : "Declined — nothing was shared.")
  const showBonus = bonusPoints != null && !!bonusWindowLabel

  return (
    <Card
      data-slot="reveal-request-card"
      data-testid="reveal-request-card"
      data-status={status}
      className={cn(
        "jb-fade ring-primary/20 bg-linear-to-b from-accent/70 to-card",
        className
      )}
    >
      <div className="flex flex-col gap-3 px-5">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">
            {eyebrow}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="font-heading text-base font-medium tracking-tight text-foreground">
            {headline}
          </div>
          <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>

        {isPending ? (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-lg border border-primary/20 bg-background px-3.5 py-2.5">
                <div className="mb-1 text-[9.5px] font-semibold tracking-wide text-primary uppercase">
                  They&apos;ll see
                </div>
                <div className="text-[12.5px] leading-snug text-muted-foreground">{shares}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
                <div className="mb-1 text-[9.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Stays hidden
                </div>
                <div className="text-[12.5px] leading-snug text-muted-foreground">
                  {withheld}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={pending}
                data-testid={testIds?.accept ?? "reveal-request-accept"}
                onClick={onAccept}
              >
                Accept · +{rewardPoints} pts
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                data-testid={testIds?.decline ?? "reveal-request-decline"}
                onClick={onDecline}
              >
                Decline
              </Button>
              {onReviewDetails && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={onReviewDetails}>
                  Review details
                </Button>
              )}
              {showBonus && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Accept within {bonusWindowLabel} for the +{bonusPoints} pts fast-response bonus.
                </span>
              )}
            </div>
          </>
        ) : (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-3"
            data-testid="reveal-request-resolution"
          >
            <span
              className={cn(
                "size-2 flex-none rounded-full",
                status === "accepted" ? "bg-primary" : "bg-muted-foreground/50"
              )}
              aria-hidden="true"
            />
            <span className="text-[12.5px] font-medium text-foreground">{resolved}</span>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5">
          <ShieldCheck
            className="mt-0.5 size-3.5 flex-none text-primary"
            aria-hidden="true"
          />
          <span className="text-[11.5px] leading-relaxed text-muted-foreground">
            {assuranceNote}
          </span>
        </div>
      </div>
    </Card>
  )
}
