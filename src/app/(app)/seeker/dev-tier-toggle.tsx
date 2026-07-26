"use client";

import { useTransition } from "react";
import { Button } from "@jumponboard/ui";
import type { SeekerTier } from "@/lib/matching";
import { toggleSeekerTier } from "./actions";

/** Dev-only: no billing integration exists yet for the Pro tier — this lets
 * the high-match-band gate be demoed/tested locally. Server action refuses
 * outside dev regardless of whether this renders. */
export function DevTierToggle({ tier }: { tier: SeekerTier }) {
  const [pending, startTransition] = useTransition();
  if (process.env.NODE_ENV === "production") return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      className="border border-dashed text-xs text-muted-foreground"
      disabled={pending}
      onClick={() => startTransition(() => toggleSeekerTier())}
    >
      Dev: seeker_tier={tier} — toggle
    </Button>
  );
}
