"use client";

import { useState, useTransition } from "react";
import { updateHideNameOnReveal } from "../recruiter/actions";

/** Recruiter-owned opt-out (migration 0028): withholds this recruiter's
 * identity on a seeker Pro-tier "who accessed my data" view. Lives on the
 * shared role-aware /settings page (minimal recruiter-facing surface per the
 * Phase 6 brief) rather than a dedicated /recruiter/settings route. */
export function HideNameToggle({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Hide my name from candidates&apos; access log</span>
        <span className="text-[13px] leading-normal text-muted-foreground">
          When on, a seeker viewing &ldquo;who accessed my data&rdquo; sees &ldquo;A
          recruiter&rdquo; instead of your name — even if they&apos;re on the Pro tier. This does
          not affect the reveal/messaging flow itself; candidates you reveal can still see
          who&apos;s contacting them there.
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Hide my name from candidates' access log"
        disabled={pending}
        data-testid="hide-name-on-reveal-toggle"
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          startTransition(() => updateHideNameOnReveal(next));
        }}
        className={
          "relative h-6 w-10 flex-none rounded-full transition-colors " +
          (enabled ? "bg-primary" : "bg-secondary")
        }
      >
        <span
          className={
            "absolute top-0.5 size-5 rounded-full bg-primary-foreground shadow transition-[left] " +
            (enabled ? "left-[18px]" : "left-0.5")
          }
        />
      </button>
    </div>
  );
}
