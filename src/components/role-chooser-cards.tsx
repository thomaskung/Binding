"use client";

import { Button } from "@jumponboard/ui";

/** Shared two-card role chooser used by /signup (pre-auth) and /onboarding
 * (post-auth). Each context wires its own onPick handler. */
export function RoleChooserCards({
  onPick,
}: {
  onPick: (role: "seeker" | "recruiter") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Button
        variant="outline"
        className="h-28 flex-col"
        data-testid="choose-seeker"
        onClick={() => onPick("seeker")}
      >
        <span className="text-lg font-medium">Find a job</span>
        <span className="text-xs text-muted-foreground">
          Join the talent pool, pseudonymously
        </span>
      </Button>
      <Button
        variant="outline"
        className="h-28 flex-col"
        data-testid="choose-recruiter"
        onClick={() => onPick("recruiter")}
      >
        <span className="text-lg font-medium">Hire talent</span>
        <span className="text-xs text-muted-foreground">
          Post roles, reveal matched candidates
        </span>
      </Button>
    </div>
  );
}
