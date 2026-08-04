"use client";

import { useTransition } from "react";
import { Button } from "@binding/ui";
import { recruiterTierLabel, type RecruiterTier } from "@/lib/recruiter-tier";
import { toggleRecruiterTier } from "./actions";

/** Dev-only: no billing integration exists yet for recruiter tiers — this lets
 * the tier badge be demoed/tested locally. Server action refuses outside dev
 * regardless of whether this renders. */
export function DevRecruiterTierToggle({ tier }: { tier: RecruiterTier }) {
  const [pending, startTransition] = useTransition();
  if (process.env.NODE_ENV === "production") return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      className="border border-dashed text-xs text-muted-foreground"
      disabled={pending}
      onClick={() => startTransition(() => toggleRecruiterTier())}
    >
      Dev: recruiter_tier={recruiterTierLabel(tier)} — toggle
    </Button>
  );
}
