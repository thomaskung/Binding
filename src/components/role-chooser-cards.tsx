"use client";

import { Button } from "@binding/ui";

/** Shared two-card role chooser used by /signup (pre-auth) and /onboarding
 * (post-auth). Each context wires its own onPick handler. Genuinely
 * clickable tiles — jb-lift + an accent tint on hover, per the mockup's
 * card-as-button pattern. */
export function RoleChooserCards({
  onPick,
}: {
  onPick: (role: "seeker" | "recruiter") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Button
        variant="outline"
        className="jb-lift h-32 flex-col gap-1.5 hover:border-primary/40 hover:bg-accent"
        data-testid="choose-seeker"
        onClick={() => onPick("seeker")}
      >
        <span className="font-heading text-lg font-medium">Find a job</span>
        <span className="text-xs text-muted-foreground">
          Join the talent pool, pseudonymously
        </span>
      </Button>
      <Button
        variant="outline"
        className="jb-lift h-32 flex-col gap-1.5 hover:border-primary/40 hover:bg-accent"
        data-testid="choose-recruiter"
        onClick={() => onPick("recruiter")}
      >
        <span className="font-heading text-lg font-medium">Hire talent</span>
        <span className="text-xs text-muted-foreground">
          Post roles, reveal matched candidates
        </span>
      </Button>
    </div>
  );
}
