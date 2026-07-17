"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publishProfile, refineProfileText, saveDraft, updateSettings } from "../actions";

const WORK_SETUPS = ["onsite", "hybrid", "remote"] as const;

interface Props {
  draftText: string;
  publishedText: string | null;
  redactedText: string | null;
  visibility: "active" | "paused";
  overrideEnabled: boolean;
  minSalary: number | null;
  workSetups: string[];
}

export function ProfileEditor(props: Props) {
  const [draft, setDraft] = useState(props.draftText);
  const [suggestion, setSuggestion] = useState<string | null>(null);
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

  function refine() {
    startTransition(async () => {
      setStatus("Asking the AI for a refinement…");
      const refined = await refineProfileText(draft);
      setSuggestion(refined);
      setStatus(null);
    });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage profile</h1>
        <Button variant="ghost" render={<Link href="/seeker" />}>
          ← Matches
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile text</CardTitle>
          <CardDescription>
            Edits are drafts until you publish. Publishing re-runs
            redact → embed → match (one AI pass per publish).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
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
            <Button variant="outline" size="sm" disabled={pending || !draft.trim()} onClick={refine}>
              Refine with AI
            </Button>
          </div>

          <form
            id="draft-form"
            action={(fd) => {
              fd.set("draft_text", draft);
              startTransition(async () => {
                await saveDraft(fd);
                setStatus("Draft saved.");
              });
            }}
            className="space-y-4"
          >
            <Textarea
              name="draft_text_visible"
              data-testid="profile-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              placeholder="Paste or write your professional profile — skills, experience, achievements. Leave out your name; we redact anyway."
            />

            {suggestion !== null && (
              <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Current</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{draft}</p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">AI suggestion</p>
                  <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setDraft(suggestion);
                        setSuggestion(null);
                      }}
                    >
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_salary">Minimum base salary (USD) — dealbreaker</Label>
                <Input
                  id="min_salary"
                  name="min_salary"
                  type="number"
                  defaultValue={props.minSalary ?? ""}
                  placeholder="e.g. 90000"
                />
              </div>
              <div className="space-y-2">
                <Label>Acceptable work setups</Label>
                <div className="flex gap-4 pt-2">
                  {WORK_SETUPS.map((setup) => (
                    <label key={setup} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        name="work_setups"
                        value={setup}
                        defaultChecked={props.workSetups.includes(setup)}
                      />
                      {setup}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={pending}>
                Save draft
              </Button>
              <Button
                type="button"
                data-testid="publish-profile"
                disabled={pending || !draft.trim()}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("draft_text", draft);
                  startTransition(async () => {
                    await saveDraft(fd);
                    await publishProfile();
                    setStatus("Published — your redacted profile is live in the pool.");
                  });
                }}
              >
                Publish to pool
              </Button>
            </div>
          </form>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </CardContent>
      </Card>

      {props.redactedText && (
        <Card>
          <CardHeader>
            <CardTitle>What recruiters see</CardTitle>
            <CardDescription>
              Your live redacted profile. Pseudonymized — but treat redaction as
              risk reduction, not a guarantee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap" data-testid="redacted-preview">
              {props.redactedText}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Privacy settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateSettings} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Profile visibility</p>
                <p className="text-sm text-muted-foreground">
                  Paused = no new matches; existing conversations stay open.
                </p>
              </div>
              <select
                name="visibility"
                defaultValue={props.visibility}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Allow paid reveal-override</p>
                <p className="text-sm text-muted-foreground">
                  Off = nobody can reveal you before you express interest, at
                  any price. On = recruiters can pay extra to reveal early and
                  you earn points either way.{" "}
                  <Badge variant="outline">override flow ships post-MVP</Badge>
                </p>
              </div>
              <input
                type="checkbox"
                name="reveal_override_enabled"
                defaultChecked={props.overrideEnabled}
              />
            </div>
            <Button type="submit" variant="outline">
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
