"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@binding/ui";
import type { ScreeningQuestion } from "@/lib/screening-questions";
import {
  generateScreeningQuestionsFromJd,
  publishScreeningQuestions,
  saveScreeningQuestions,
  setScreeningEnabled,
  unpublishScreeningQuestions,
  updateScreeningPrefs,
} from "../screening-actions";

interface Props {
  jobId: string | null;
  jobDescription: string;
  initialEnabled: boolean;
  initialQuestions: ScreeningQuestion[];
  initialStatus: "draft" | "published";
  initialPrefs: Record<string, "required" | "weighted">;
}

/** Small dedicated review panel (DESIGN.md §14c, Phase 13) — same
 * "not folded into existing fields" posture as Phase 12's rubric review
 * panel, adapted for a per-job question SET rather than per-skill rows: one
 * status column gates the whole current array at once. A draft question is
 * never candidate-visible (src/app/(app)/seeker/screening-actions.ts only
 * ever reads screening_status = 'published'). */
export function ScreeningQuestionsPanel({
  jobId,
  jobDescription,
  initialEnabled,
  initialQuestions,
  initialStatus,
  initialPrefs,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [questions, setQuestions] = useState(initialQuestions);
  const [status, setStatus] = useState(initialStatus);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generating, startGenerateTransition] = useTransition();

  if (!jobId) return null;

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      try {
        await setScreeningEnabled(jobId!, next);
      } catch (e) {
        setEnabled(!next);
        setError(e instanceof Error ? e.message : "Toggle failed");
      }
    });
  }

  function generate() {
    setError(null);
    startGenerateTransition(async () => {
      try {
        const drafts = await generateScreeningQuestionsFromJd(jobDescription);
        setQuestions((prev) => [...prev, ...drafts]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed");
      }
    });
  }

  function updateField(id: string, field: "question" | "rubric", value: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    // Mirror the server-side prune in saveScreeningQuestions so the UI
    // doesn't keep showing a Required/Weighted toggle highlighted for a
    // question that's about to be removed from screening_prefs on save.
    setPrefs((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addManualQuestion() {
    setQuestions((prev) => [...prev, { id: crypto.randomUUID(), question: "", rubric: "" }]);
  }

  function saveDraft() {
    setError(null);
    startTransition(async () => {
      try {
        await saveScreeningQuestions(jobId!, questions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      try {
        await saveScreeningQuestions(jobId!, questions);
        await publishScreeningQuestions(jobId!);
        setStatus("published");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Publish failed");
      }
    });
  }

  function unpublish() {
    startTransition(async () => {
      await unpublishScreeningQuestions(jobId!);
      setStatus("draft");
    });
  }

  function setPref(questionId: string, next: "required" | "weighted" | null) {
    const updated = { ...prefs };
    if (next) updated[questionId] = next;
    else delete updated[questionId];
    setPrefs(updated);
    startTransition(async () => {
      try {
        await updateScreeningPrefs(jobId!, updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Preference save failed");
      }
    });
  }

  return (
    <Card className="jb-lift" data-testid="screening-questions-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Screening questions</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={status === "published" ? "default" : "secondary"} data-testid="screening-status">
              {status}
            </Badge>
            <Button
              size="sm"
              variant={enabled ? "default" : "outline"}
              onClick={toggleEnabled}
              disabled={pending}
              data-testid="toggle-screening-enabled"
            >
              {enabled ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </div>
        <CardDescription>
          AI-drafted, candidate-facing questions graded against a rubric — same required/weighted model as
          Verified skills. A draft set is never candidate-visible until published.
        </CardDescription>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={generate} disabled={generating} data-testid="generate-screening-questions">
              {generating ? "Generating…" : "Generate with AI"}
            </Button>
            <Button size="sm" variant="ghost" onClick={addManualQuestion} data-testid="add-screening-question">
              Add manually
            </Button>
          </div>

          <ul className="space-y-2.5" data-testid="screening-question-list">
            {questions.map((q) => (
              <li key={q.id} data-testid="screening-question-row" className="space-y-1.5 rounded-lg border p-3">
                <Textarea
                  value={q.question}
                  onChange={(e) => updateField(q.id, "question", e.target.value)}
                  placeholder="Question shown to the candidate"
                  data-testid="screening-question-text"
                />
                <Textarea
                  value={q.rubric}
                  onChange={(e) => updateField(q.id, "rubric", e.target.value)}
                  placeholder="Grading rubric (never shown to the candidate)"
                  data-testid="screening-question-rubric"
                />
                <div className="flex items-center justify-between gap-2">
                  {status === "published" ? (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant={prefs[q.id] === "required" ? "default" : "outline"}
                        onClick={() => setPref(q.id, prefs[q.id] === "required" ? null : "required")}
                        data-testid={`screening-required-${q.id}`}
                      >
                        Required
                      </Button>
                      <Button
                        size="sm"
                        variant={prefs[q.id] === "weighted" ? "default" : "outline"}
                        onClick={() => setPref(q.id, prefs[q.id] === "weighted" ? null : "weighted")}
                        data-testid={`screening-weighted-${q.id}`}
                      >
                        Weighted
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Publish to set required/weighted</span>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => removeQuestion(q.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <Button size="sm" onClick={saveDraft} disabled={pending} data-testid="save-screening-questions">
              Save draft
            </Button>
            {status === "draft" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={publish}
                disabled={pending || questions.length === 0}
                data-testid="publish-screening-questions"
              >
                Publish
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={unpublish} disabled={pending} data-testid="unpublish-screening-questions">
                Revert to draft
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      )}
    </Card>
  );
}
