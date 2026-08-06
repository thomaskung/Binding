import { Sparkles, ShieldCheck } from "lucide-react"

import { cn } from "./utils"
import { Card } from "./card"
import { Progress } from "./progress"

/** One row in a {@link CreditLedger}'s transaction list. */
export interface CreditLedgerEntry {
  /** Stable key for the row. Falls back to array index if omitted. */
  id?: string | number
  /** Primary label, e.g. "Reveal accepted" or "Course completed". */
  label: string
  /** Secondary context, pre-formatted by the caller (e.g. "Nimbus Cloud Systems · 2 Aug"). */
  note: string
  /** Signed amount for this entry, e.g. `5` or `-40`. Sign alone drives credit/debit styling. */
  amount: number
}

/**
 * Props for {@link CreditLedger}. Fully controlled and presentational — the
 * component holds no balance state, fetches nothing, and contains no points
 * economics. Callers (e.g. `/seeker/points`, training-credit surfaces) own
 * all data; this only renders it.
 */
export interface CreditLedgerProps {
  /** Small-caps label above the balance, e.g. "Training credits" or "Points". */
  label: string
  /** Headline balance figure. Rendered verbatim — format/localize before passing in. */
  balance: string | number
  /** Note beside the balance clarifying provenance, e.g. "personal · earned, not bought". */
  balanceNote?: string
  /**
   * Title of the progress-to-goal panel, e.g. "Path · Staff Platform Engineer".
   * The whole goal panel is omitted when this is not set.
   */
  goalTitle?: string
  /** Meta text beside the goal title, e.g. "5 of 8 steps". Caller-formatted; keep it free of raw match percentages on seeker-facing surfaces. */
  goalMeta?: string
  /** Progress toward the goal, 0–100. Clamped; ignored (goal panel just shows no fill) if omitted. */
  goalPercent?: number
  /** Transaction rows, most-recent first. */
  entries: CreditLedgerEntry[]
  /** Copy shown when `entries` is empty. Defaults to "No activity yet." */
  emptyMessage?: string
  /** Footnote distinguishing non-fungible pools, e.g. sponsored vs. personal credits. Omitted entirely when not set. */
  footnote?: string
  className?: string
}

function clampPercent(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined
  return Math.min(100, Math.max(0, value))
}

/**
 * Earned-currency balance panel: headline figure, an optional progress-to-goal
 * strip, a credit/debit-coloured transaction list, and an optional footnote
 * keeping non-fungible pools apart (e.g. sponsored vs. personal credits).
 *
 * Used by `/seeker/points` and training-credit surfaces. Purely presentational —
 * pass already-computed data and this renders it; no fetching, no ledger math.
 */
export function CreditLedger({
  label,
  balance,
  balanceNote,
  goalTitle,
  goalMeta,
  goalPercent,
  entries,
  emptyMessage = "No activity yet.",
  footnote,
  className,
}: CreditLedgerProps) {
  const pct = clampPercent(goalPercent)

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="border-b px-5 py-4">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-heading text-3xl font-medium tracking-tight">{balance}</span>
          {balanceNote && (
            <span className="text-[12.5px] text-muted-foreground">{balanceNote}</span>
          )}
        </div>
      </div>

      {goalTitle && (
        <div className="mx-5 mt-3.5 rounded-xl border border-ring/20 bg-accent p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-accent-foreground">{goalTitle}</span>
            {goalMeta && (
              <span className="text-[11px] font-semibold whitespace-nowrap text-primary">
                {goalMeta}
              </span>
            )}
          </div>
          <Progress
            value={pct ?? 0}
            className="[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-background/60"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 px-5 py-3.5">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
        {entries.map((entry, i) => {
          const credit = entry.amount >= 0
          return (
            <div key={entry.id ?? i} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-[30px] flex-none items-center justify-center rounded-[9px]",
                  credit ? "bg-accent text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Sparkles className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">{entry.label}</div>
                <div className="text-[11.5px] text-muted-foreground">{entry.note}</div>
              </div>
              <div
                className={cn(
                  "flex-none text-[13px] font-semibold tabular-nums",
                  credit ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {credit ? `+${entry.amount}` : entry.amount}
              </div>
            </div>
          )
        })}
      </div>

      {footnote && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-xl border bg-muted p-3.5">
          <ShieldCheck className="mt-0.5 size-[15px] flex-none text-primary" />
          <span className="text-[11.5px] leading-relaxed text-muted-foreground">{footnote}</span>
        </div>
      )}
    </Card>
  )
}
