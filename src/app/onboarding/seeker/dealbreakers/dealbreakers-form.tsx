"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardFooter, Input, Label } from "@binding/ui";
import { publishProfile, saveDealbreakers } from "@/app/(app)/seeker/actions";
import { OnboardingChrome } from "../onboarding-chrome";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

/** Onboarding step 3 (own route — see page.tsx). Finish persists the
 * dealbreaker matrix then publishes; Back returns to the resume wizard. */
export function DealbreakersForm({
  draftText,
  minSalary,
  workSetups,
  equityRequired,
}: {
  draftText: string;
  minSalary: number | null;
  workSetups: string[];
  equityRequired: boolean;
}) {
  const router = useRouter();
  const [minSalaryValue, setMinSalaryValue] = useState(minSalary?.toString() ?? "");
  const [workSetupVals, setWorkSetupVals] = useState<string[]>(workSetups);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function finish() {
    startTransition(async () => {
      try {
        await saveDealbreakers({
          minSalary: minSalaryValue ? Number(minSalaryValue) : null,
          workSetups: workSetupVals,
          equityRequired,
        });
        await publishProfile();
        router.push("/seeker");
      } catch (err) {
        // Same survival principle as the resume wizard: a transient server
        // error must not crash the page to the Next error boundary (React #441
        // — the override E2E flake). Stay mounted, show a retryable message.
        console.error("onboarding publish failed", err);
        setStatus("Couldn't publish your profile. Check your connection and try again.");
      }
    });
  }

  return (
    <OnboardingChrome
      current={3}
      skipHref="/seeker"
      title="Your dealbreakers"
      description="We'll only surface roles that clear these bars."
    >
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="min_salary">Minimum base salary (USD)</Label>
            <Input
              id="min_salary"
              data-testid="onboarding-min-salary"
              type="number"
              value={minSalaryValue}
              onChange={(e) => setMinSalaryValue(e.target.value)}
              placeholder="e.g. 90000"
            />
            <p className="text-xs text-muted-foreground">
              Shared with recruiters only if you opt in — never shown publicly.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Work setup</Label>
            <div className="flex gap-4">
              {WORK_SETUPS.map((setup) => (
                <label key={setup} className="flex items-center gap-1.5 text-sm capitalize">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={workSetupVals.includes(setup)}
                    onChange={(e) =>
                      setWorkSetupVals((prev) =>
                        e.target.checked ? [...prev, setup] : prev.filter((s) => s !== setup),
                      )
                    }
                  />
                  {setup}
                </label>
              ))}
            </div>
          </div>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </CardContent>
        <CardFooter className="flex gap-2.5">
          <Button variant="outline" disabled={pending} onClick={() => router.push("/onboarding/seeker/profile")}>
            Back
          </Button>
          <Button
            className="flex-1"
            data-testid="onboarding-finish"
            disabled={pending || !draftText.trim()}
            onClick={finish}
          >
            Finish &amp; publish profile
          </Button>
        </CardFooter>
      </Card>
    </OnboardingChrome>
  );
}
