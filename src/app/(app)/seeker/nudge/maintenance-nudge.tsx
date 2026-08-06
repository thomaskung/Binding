"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Separator, Textarea } from "@binding/ui";
import {
  acceptMaintenanceUpdate,
  requestMaintenanceDraft,
  updateMaintenanceConsent,
} from "@/app/(app)/seeker/actions";

interface Props {
  stale: boolean;
  latestRole: string | null;
  latestCompany: string | null;
  latestExperienceLine: string | null;
  maintenanceConsented: boolean;
}

/** Stale-profile nudge (MaintenanceNudge template): ask a quick question,
 * review an AI-drafted suggest-and-approve addition (editable before
 * approval), then an up-to-date confirmation state. Approving republishes
 * (redact → embed → match) and earns the freshness confirmation.
 *
 * Maintenance consent is optional at onboarding (LEGAL_REVIEW.md Q14), so a
 * seeker without it gets a just-in-time consent prompt here — enable and
 * continue in one step, never silent processing. */
export function MaintenanceNudge({
  stale,
  latestRole,
  latestCompany,
  latestExperienceLine,
  maintenanceConsented,
}: Props) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [consented, setConsented] = useState(maintenanceConsented);
  const [pending, startTransition] = useTransition();

  const prompt =
    latestRole && latestCompany
      ? `Still at ${latestCompany} as a ${latestRole}? Anything new since then — a promotion, new project, or skill?`
      : "Anything new since you last updated your profile — a promotion, new project, or skill?";

  function draft() {
    startTransition(async () => {
      setStatus("Drafting from what you told us…");
      const result = await requestMaintenanceDraft(answer);
      setSuggestion(result);
      setEditing(false);
      setStatus(null);
    });
  }

  function accept() {
    if (!suggestion) return;
    startTransition(async () => {
      await acceptMaintenanceUpdate(suggestion);
      router.push("/seeker");
    });
  }

  if (!consented) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Turn on AI profile maintenance?</CardTitle>
          <CardDescription>
            This feature drafts profile updates from your answers for you to approve. It runs only
            with your consent — nothing is ever changed without your explicit approval, and you can
            withdraw any time in settings.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-2.5">
          <Button
            className="w-full"
            data-testid="nudge-enable-maintenance"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateMaintenanceConsent(true);
                setConsented(true);
              })
            }
          >
            Enable and continue
          </Button>
          <Link href="/seeker" className="text-[13px] text-muted-foreground hover:underline">
            Not now
          </Link>
        </CardFooter>
      </Card>
    );
  }

  if (!stale && suggestion === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re up to date</CardTitle>
          <CardDescription>
            Last reviewed today —{" "}
            {new Date().toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
          </CardDescription>
          <CardAction>
            <Badge>Reviewed</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <span className="text-[13px] text-muted-foreground">
            We&apos;ll check in again in a few months, or whenever something changes.
          </span>
        </CardContent>
      </Card>
    );
  }

  if (suggestion !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review your update</CardTitle>
          <CardDescription>
            Draft from what you told us — nothing changes until you approve.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">Draft</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {latestExperienceLine && (
            <>
              <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                Current experience
              </span>
              <div className="rounded-xl bg-muted px-3 py-2.5 text-sm leading-normal text-muted-foreground">
                {latestExperienceLine}
              </div>
              <Separator />
            </>
          )}
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            Proposed addition
          </span>
          {editing ? (
            <Textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={3}
            />
          ) : (
            <div
              className="rounded-xl border border-ring/20 bg-accent px-3 py-2.5 text-sm leading-normal text-accent-foreground"
              data-testid="nudge-suggestion"
            >
              {suggestion}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button className="flex-1" data-testid="nudge-approve" disabled={pending} onClick={accept}>
            Approve
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setSuggestion(null);
              setEditing(false);
            }}
          >
            Discard
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keep your profile fresh</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          data-testid="nudge-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="e.g. Led the migration to event-driven payments this year…"
        />
        {status && <p className="mt-2 text-sm text-muted-foreground">{status}</p>}
      </CardContent>
      <CardFooter className="flex-col gap-2.5">
        <Button
          className="w-full"
          data-testid="nudge-draft"
          disabled={pending || !answer.trim()}
          onClick={draft}
        >
          Draft update
        </Button>
        <Link href="/seeker" className="text-[13px] text-muted-foreground hover:underline">
          Not now
        </Link>
      </CardFooter>
    </Card>
  );
}
