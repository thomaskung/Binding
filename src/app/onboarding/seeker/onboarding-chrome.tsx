import Link from "next/link";
import { cn } from "@binding/ui";

const STEP_COUNT = 3;

/** Shared chrome for the onboarding wizards (seeker + recruiter both use
 * this — OnboardingPage/RecruiterOnboarding templates share the same
 * step-chrome): a top bar (logo, optional skip link, dot progress) and a
 * "Step N of 3" eyebrow + serif title + description above the wizard's own
 * card content. `current` is 1-based. */
export function OnboardingChrome({
  current,
  title,
  description,
  skipHref,
  skipTestId = "wizard-skip",
  children,
}: {
  current: 1 | 2 | 3;
  title: string;
  description: string;
  skipHref?: string;
  skipTestId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="jb-fade min-h-screen bg-muted">
      <header className="flex h-[60px] flex-none items-center justify-between border-b border-border bg-background px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block size-6 rounded-md bg-primary" />
          <span className="text-sm font-semibold tracking-tight">Set up your profile</span>
        </Link>
        <div className="flex items-center gap-4">
          {skipHref && (
            <Link
              href={skipHref}
              data-testid={skipTestId}
              className="text-[13px] text-muted-foreground hover:underline"
            >
              You can skip and finish later
            </Link>
          )}
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
              <span
                key={n}
                className={cn("h-1 w-6 rounded-full", n <= current ? "bg-primary" : "bg-border")}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="flex justify-center px-5 py-10 sm:py-14">
        <div className="w-full max-w-[600px]">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Step {current} of {STEP_COUNT}
          </p>
          <h1 className="font-heading mt-2 text-[27px] font-medium leading-tight tracking-tight">
            {title}
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
