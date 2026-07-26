import Link from "next/link";
import { cn } from "@jumponboard/ui";

const STEPS = ["Consent", "Resume", "Dealbreakers"] as const;

/** Shared chrome for the seeker onboarding wizard (SeekerOnboarding
 * template): logo row with a skip link, and the numbered three-step
 * progress indicator. `current` is 1-based; steps below it render ✓. */
export function OnboardingChrome({
  current,
  skipHref,
  children,
}: {
  current: 1 | 2 | 3;
  skipHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted px-5 pb-20 pt-10">
      <div className="mx-auto flex max-w-[640px] flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block size-5 rounded-md bg-primary" />
            <span className="text-sm font-semibold tracking-tight">JumpOnBoard</span>
          </Link>
          {skipHref && (
            <Link
              href={skipHref}
              data-testid="wizard-skip"
              className="text-[13px] text-muted-foreground hover:underline"
            >
              You can skip and finish later
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < current;
            const active = n === current;
            return (
              <div key={label} className="contents">
                {i > 0 && <div className="-mt-4 h-px flex-[0.6] bg-border" />}
                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "flex size-[26px] items-center justify-center rounded-md text-[13px]",
                      done && "bg-primary font-medium text-primary-foreground",
                      active && "border-[1.5px] border-primary font-semibold",
                      !done && !active && "border-[1.5px] border-border text-muted-foreground",
                    )}
                  >
                    {done ? "✓" : n}
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
