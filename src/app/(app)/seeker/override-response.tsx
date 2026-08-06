"use client";

import { useState, useTransition } from "react";
import { RevealRequestCard } from "@binding/ui";
import { respondToOverride } from "./actions";

/** Pending paid-reveal (override) banner, built on the kit's RevealRequestCard.
 *
 * The card is purely presentational/controlled — this wrapper owns the mutation
 * (`respondToOverride`) and the in-flight state. Copy stays economics-honest:
 * the seeker has ALREADY been credited the reveal compensation (that is what
 * makes leaving override enabled rational, DESIGN.md §4), so acceptance opens
 * messaging rather than paying out again.
 *
 * The accept/decline testids are pinned to the pre-existing
 * `override-accept` / `override-decline` values that `e2e/override.spec.ts`
 * targets — do NOT let them fall back to the component defaults. */
export function OverrideResponseButtons({
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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "accepted" | "declined">("pending");
  const [pending, startTransition] = useTransition();

  function respond(response: "accepted" | "declined") {
    startTransition(async () => {
      try {
        await respondToOverride(revealId, response);
        setStatus(response);
      } catch (e) {
        setError(e instanceof Error ? e.message : "response failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <RevealRequestCard
        eyebrow="Reveal request"
        headline={`${recruiterLabel} revealed your profile`}
        body={`For the role: ${jobTitle}. You've already earned ${compensation} pts for the reveal — accept to open the conversation, or decline. Expires 7 days after the reveal.`}
        shares="Your name and a job-fit summary, plus in-app messaging once you accept."
        withheld="Your email, phone, raw résumé, and salary expectations — withheld whatever you choose."
        rewardPoints={compensation}
        status={status}
        pending={pending}
        onAccept={() => respond("accepted")}
        onDecline={() => respond("declined")}
        resolutionText={
          status === "accepted"
            ? "Accepted — the conversation is open in your messages."
            : "Declined. They can't override you again for 30 days."
        }
        testIds={{ accept: "override-accept", decline: "override-decline" }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
