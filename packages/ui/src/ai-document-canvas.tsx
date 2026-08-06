"use client"

import { Sparkles } from "lucide-react"

import { cn } from "./utils"
import { Badge } from "./badge"
import { Button } from "./button"
import { Input } from "./input"
import { Textarea } from "./textarea"

/** Lifecycle of a single AI suggestion within the rail. */
export type AIDocumentSuggestionStatus = "pending" | "applied" | "dismissed"

/** One before/after suggestion card rendered in the AI rail. */
export interface AIDocumentSuggestion {
  /** Stable identifier — echoed back through `onApplySuggestion`/`onDismissSuggestion`. */
  id: string
  /** Short label for what the suggestion does, e.g. "Lead with impact". */
  title: string
  /** The current document text this suggestion targets, shown struck through. */
  before: string
  /** The AI-proposed replacement text, shown as the highlighted "after" preview. */
  after: string
  /** Current lifecycle state. Defaults to "pending" styling if omitted at the call site. */
  status: AIDocumentSuggestionStatus
}

/**
 * Props for {@link AIDocumentCanvas}. Fully controlled — the component holds
 * no document state, suggestion state, or AI logic of its own; the caller
 * (résumé canvas, job-post canvas, …) owns all data and wiring.
 */
export interface AIDocumentCanvasProps {
  /** Title shown in the top bar, e.g. "Résumé canvas" or "Job post canvas". */
  canvasTitle: string
  /** Caption under the title. Defaults to "AI-assisted · your edits save automatically". */
  subtitle?: string
  /** Current document text bound to the paper-surface textarea. */
  docText: string
  /** Fired on every edit to the document textarea. */
  onDocTextChange: (text: string) => void
  /** Sentence shown at the top of the AI rail, e.g. "I found 3 ways to sharpen this draft…". */
  introText: string
  /** Quick-action chips rendered above the suggestion list (e.g. "Tighten", "Add metrics"). */
  quickActions: string[]
  /** Fired when a quick-action chip is clicked, with its label. */
  onQuickAction: (label: string) => void
  /** Before/after suggestion cards rendered in the AI rail, most-relevant first. */
  suggestions: AIDocumentSuggestion[]
  /** Fired when the user applies a pending suggestion, with its id. */
  onApplySuggestion: (id: string) => void
  /** Fired when the user dismisses a pending suggestion, with its id. */
  onDismissSuggestion: (id: string) => void
  /** Free-text "ask AI" input value. */
  askValue: string
  /** Fired on every edit to the ask input. */
  onAskChange: (value: string) => void
  /** Fired when the ask box is submitted (Send button or Enter key). */
  onAskSubmit: () => void
  /** Shows the transient "Saved ✓" indicator in the header while true. */
  saved?: boolean
  /** Fired when the Export button is clicked. Omit to hide the button entirely. */
  onExport?: () => void
  /** Disables Send/Apply/Dismiss/quick-action controls while an AI request is in flight. */
  busy?: boolean
  /** Placeholder for the ask input. Defaults to "Ask AI to rewrite…". */
  askPlaceholder?: string
  /** Placeholder for the empty document textarea. */
  docPlaceholder?: string
  /** Additional className for the outer container, for layout composition. */
  className?: string
  /**
   * `data-testid` for the outer container. e2e specs target semantic
   * elements directly, so also see `docTestId`/`askTestId`/`sendTestId`/
   * `exportTestId` for the interactive elements inside.
   */
  testId?: string
  /** `data-testid` for the document textarea (e.g. "profile-draft" on the résumé canvas). */
  docTestId?: string
  /** `data-testid` for the free-text ask input. */
  askTestId?: string
  /** `data-testid` for the ask box's Send button. */
  sendTestId?: string
  /** `data-testid` for the Export button, when `onExport` is provided. */
  exportTestId?: string
}

/**
 * Split editing surface: a paper-like document on the left, an AI assistant
 * rail on the right with quick actions, before/after suggestion diffs that
 * apply or dismiss in place, and an ask box. Shared by the résumé canvas and
 * the job-post (JD) canvas — presentational and controlled only.
 */
export function AIDocumentCanvas({
  canvasTitle,
  subtitle = "AI-assisted · your edits save automatically",
  docText,
  onDocTextChange,
  introText,
  quickActions,
  onQuickAction,
  suggestions,
  onApplySuggestion,
  onDismissSuggestion,
  askValue,
  onAskChange,
  onAskSubmit,
  saved = false,
  onExport,
  busy = false,
  askPlaceholder = "Ask AI to rewrite…",
  docPlaceholder,
  className,
  testId,
  docTestId,
  askTestId,
  sendTestId,
  exportTestId,
}: AIDocumentCanvasProps) {
  const pendingCount = suggestions.filter((s) => s.status === "pending").length

  return (
    <div
      data-slot="ai-document-canvas"
      data-testid={testId}
      className={cn(
        "jb-fade overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <div className="font-heading text-sm font-semibold leading-tight">
              {canvasTitle}
            </div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={cn(
              "text-xs font-medium text-primary transition-opacity",
              saved ? "opacity-100" : "opacity-0"
            )}
          >
            Saved ✓
          </span>
          <Badge className="whitespace-nowrap bg-accent text-accent-foreground">
            ✦ {pendingCount} AI edit{pendingCount === 1 ? "" : "s"} ready
          </Badge>
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={busy}
              data-testid={exportTestId}
            >
              Export
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex min-h-[560px] justify-center bg-muted p-6">
          <div className="flex w-full max-w-[640px] flex-col rounded-xl border border-border bg-background shadow-sm">
            <Textarea
              data-slot="ai-document-canvas-text"
              data-testid={docTestId}
              value={docText}
              onChange={(e) => onDocTextChange(e.target.value)}
              placeholder={docPlaceholder}
              spellCheck={false}
              className="min-h-[520px] flex-1 resize-none border-none bg-transparent p-11 text-[13.5px] leading-[1.85] shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex max-h-[640px] flex-col border-t border-border bg-card md:border-t-0 md:border-l">
          <div className="flex items-start gap-2.5 border-b border-border px-4 py-3.5">
            <div className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              AI
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{introText}</p>
          </div>

          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
            {quickActions.map((label) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => onQuickAction(label)}
                className="rounded-full bg-muted px-3 py-1.5 text-[11.5px] font-semibold text-foreground/80 ring-1 ring-transparent transition-colors hover:bg-accent hover:text-accent-foreground hover:ring-primary/30 disabled:pointer-events-none disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
            {suggestions.map((g) => (
              <div
                key={g.id}
                data-slot="ai-document-canvas-suggestion"
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Sparkles className="size-3 text-primary" />
                  <span className="text-xs font-semibold">{g.title}</span>
                </div>
                <div className="mb-1.5 text-[11px] leading-snug text-muted-foreground line-through">
                  {g.before}
                </div>
                <div className="rounded-lg bg-accent px-2.5 py-2 text-[11.5px] leading-relaxed text-accent-foreground">
                  {g.after}
                </div>
                <div className="mt-2.5">
                  {g.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button
                        size="xs"
                        disabled={busy}
                        onClick={() => onApplySuggestion(g.id)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onDismissSuggestion(g.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {g.status === "applied" && (
                    <span className="text-xs font-semibold text-primary">Applied ✓</span>
                  )}
                  {g.status === "dismissed" && (
                    <span className="text-xs font-semibold text-muted-foreground">
                      Dismissed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-border px-4 py-3">
            <Input
              data-testid={askTestId}
              value={askValue}
              onChange={(e) => onAskChange(e.target.value)}
              placeholder={askPlaceholder}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && askValue.trim()) {
                  e.preventDefault()
                  onAskSubmit()
                }
              }}
            />
            <Button
              size="sm"
              disabled={busy || !askValue.trim()}
              onClick={onAskSubmit}
              data-testid={sendTestId}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
