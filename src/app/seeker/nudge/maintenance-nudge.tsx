"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Textarea } from "@jumponboard/ui";
import { acceptMaintenanceUpdate, requestMaintenanceDraft } from "@/app/seeker/actions";

interface Props {
  stale: boolean;
  latestRole: string | null;
  latestCompany: string | null;
}

export function MaintenanceNudge({ stale, latestRole, latestCompany }: Props) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  if (!stale && suggestion === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re up to date</CardTitle>
          <CardDescription>Last reviewed today — nothing to nudge yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keep your profile fresh</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          data-testid="nudge-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="Tell us what changed…"
        />
        <Button data-testid="nudge-draft" disabled={pending || !answer.trim()} onClick={draft}>
          Draft update
        </Button>

        {status && <p className="text-sm text-muted-foreground">{status}</p>}

        {suggestion !== null && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">Proposed addition to your profile</p>
              <p className="text-sm whitespace-pre-wrap" data-testid="nudge-suggestion">
                {suggestion}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Draft from what you told us — nothing changes until you approve.
              </p>
              <div className="mt-3 flex gap-2">
                <Button data-testid="nudge-approve" disabled={pending} onClick={accept}>
                  Approve
                </Button>
                <Button variant="outline" disabled={pending} onClick={draft}>
                  Edit (redraft)
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setSuggestion(null)}>
                  Discard
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
