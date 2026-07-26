"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
} from "@jumponboard/ui";
import { PROFILE_QUICK_ACTIONS } from "@/lib/profile";
import { publishProfile, refineProfileText, saveDraftText } from "../../actions";

interface Props {
  draftText: string;
  redactedText: string | null;
  seekerTier: "free" | "pro";
}

/** Resume editor canvas (the NavShell template's Profile surface): a
 * document-style draft view with a bottom AI bar — quick-action chips for
 * everyone, free-text Ask-AI for Pro (server-enforced tier gate +
 * rate limit), Apply/Dismiss suggestion review, explicit publish. Publishing
 * re-runs redact → embed → match. */
export function ResumeCanvas(props: Props) {
  const [draft, setDraft] = useState(props.draftText);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadResume(file: File) {
    setStatus("Extracting text…");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/ingest", { method: "POST", body });
    if (!res.ok) {
      setStatus(`Upload failed: ${(await res.json().catch(() => null))?.error ?? res.status}`);
      return;
    }
    const { text } = (await res.json()) as { text: string };
    setDraft(text);
    setStatus("Resume text extracted — review below, then publish.");
  }

  function refine(instruction?: string) {
    startTransition(async () => {
      setStatus("Asking the AI for a refinement…");
      try {
        const refined = await refineProfileText(draft, instruction);
        setSuggestion(refined);
        setStatus(null);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Refinement failed.");
      }
    });
  }

  function persistDraft(thenPublish: boolean) {
    startTransition(async () => {
      await saveDraftText(draft);
      if (thenPublish) {
        await publishProfile();
        setStatus("Published — your redacted profile is live in the pool.");
      } else {
        setStatus("Draft saved.");
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-1.5 flex items-center gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight">Resume</h1>
            <Badge variant="outline">Seeker</Badge>
          </div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Edit your resume live — ask AI for changes, approve before they apply.
            </p>
            <span className="flex-none text-xs text-muted-foreground">
              {status ?? "Edits are drafts until you publish"}
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-9 shadow-sm">
            <Textarea
              data-testid="profile-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={20}
              className="min-h-[480px] resize-y border-none p-0 shadow-none focus-visible:ring-0"
              placeholder="Paste or write your professional profile — skills, experience, achievements. Leave out your name; we redact anyway."
            />
          </div>

          {props.redactedText && (
            <div className="mt-5 rounded-xl border border-border bg-muted/40 p-6">
              <p className="mb-1 text-sm font-medium">What recruiters see</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Your live redacted profile, including derived signals (never raw work-history
                entries). Pseudonymized — but treat redaction as risk reduction, not a guarantee.
              </p>
              <p className="whitespace-pre-wrap text-sm" data-testid="redacted-preview">
                {props.redactedText}
              </p>
            </div>
          )}

          <div className="mt-4">
            <Button variant="ghost" size="sm" render={<Link href="/seeker/profile" />}>
              ← Back to profile
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-none border-t border-border bg-background px-5 py-3">
        <div className="mx-auto flex max-w-[960px] flex-col gap-2.5">
          {suggestion !== null && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>AI suggestion — review before it changes your resume</CardTitle>
                <CardDescription className="whitespace-pre-wrap">{suggestion}</CardDescription>
              </CardHeader>
              <CardFooter className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setDraft(suggestion);
                    setSuggestion(null);
                  }}
                >
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                  Dismiss
                </Button>
              </CardFooter>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadResume(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              Upload resume PDF
            </Button>
            {PROFILE_QUICK_ACTIONS.map((action) => (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                disabled={pending || !draft.trim()}
                onClick={() => refine(action.instruction)}
              >
                {action.label}
              </Button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => persistDraft(false)}>
                Save draft
              </Button>
              <Button
                size="sm"
                data-testid="publish-profile"
                disabled={pending || !draft.trim()}
                onClick={() => persistDraft(true)}
              >
                Publish to pool
              </Button>
            </div>
          </div>

          {props.seekerTier === "pro" ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex-none">
                Pro
              </Badge>
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI to rewrite a section, tighten wording, add a role…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && chatInput.trim() && draft.trim() && !pending) {
                    refine(chatInput.trim());
                    setChatInput("");
                  }
                }}
              />
              <Button
                disabled={pending || !draft.trim() || !chatInput.trim()}
                onClick={() => {
                  refine(chatInput.trim());
                  setChatInput("");
                }}
              >
                Ask AI
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Quick actions above are free — free-text AI chat is a Pro feature.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
