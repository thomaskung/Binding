"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@binding/ui";
import { OverrideResponseButtons } from "./override-response";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Full-height slide-over sheet for a pending reveal-override request.
 *
 * Renders a trigger button that opens a side panel containing the full
 * OverrideResponseButtons component. The slide-over persists the same
 * accept/decline flow as the inline card, with the same testid pinning
 * for e2e (override-accept/override-decline are inherited from the
 * wrapped OverrideResponseButtons).
 *
 * This is ADDITIVE to the existing inline dashboard card — both surfaces
 * are live. The e2e specs targeting the inline card's testids are unaffected.
 */
export function RevealRequestSheet({
  revealId,
  recruiterLabel,
  jobTitle,
  compensation,
}: {
  revealId: string;
  /** Company (preferred) or display name of the requesting recruiter. */
  recruiterLabel: string;
  jobTitle: string;
  /** Points already credited for the reveal itself. */
  compensation: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="reveal-request-sheet-trigger"
      >
        View full details
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="h-screen max-h-screen flex flex-col rounded-none sm:max-w-md ml-auto"
          showCloseButton={false}
        >
          <DialogHeader className="border-b pb-3">
            <DialogTitle>Reveal Request</DialogTitle>
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />}
              data-testid="reveal-request-sheet-close"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            <OverrideResponseButtons
              revealId={revealId}
              recruiterLabel={recruiterLabel}
              jobTitle={jobTitle}
              compensation={compensation}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
