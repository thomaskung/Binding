"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from "@binding/ui";
import {
  createSkillAssessment,
  discardSkillAssessment,
  publishSkillAssessment,
  updateSkillAssessment,
  type SkillAssessmentSummary,
} from "../skill-assessment-actions";

interface Props {
  initialAssessments: SkillAssessmentSummary[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Small dedicated review panel (DESIGN.md §14b): editable prompt/rubric
 * text + Publish/Discard, on the assessment-setup screen. Every field stays
 * editable regardless of status — a rubric change only affects FUTURE
 * grading calls, never past attempts, so there's no reason to lock it after
 * publish. */
export function SkillAssessmentManager({ initialAssessments }: Props) {
  const [assessments, setAssessments] = useState(initialAssessments);
  const [skill, setSkill] = useState("");
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [editing, setEditing] = useState<Record<string, { prompt: string; rubric: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const id = await createSkillAssessment({ skill, prompt, rubric });
        setAssessments((prev) => [
          { id, skill: skill.trim(), prompt: prompt.trim(), rubric: rubric.trim(), status: "draft", createdAt: new Date().toISOString() },
          ...prev,
        ]);
        setSkill("");
        setPrompt("");
        setRubric("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  function saveEdit(id: string) {
    const draft = editing[id];
    if (!draft) return;
    startTransition(async () => {
      try {
        await updateSkillAssessment(id, draft);
        setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, prompt: draft.prompt, rubric: draft.rubric } : a)));
        setEditing((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function publish(id: string) {
    startTransition(async () => {
      await publishSkillAssessment(id);
      setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "published" } : a)));
    });
  }

  function discard(id: string) {
    startTransition(async () => {
      await discardSkillAssessment(id);
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <div className="space-y-5">
      <Card className="jb-lift">
        <CardHeader>
          <CardTitle className="text-sm">New assessment</CardTitle>
          <CardDescription>Lands as a draft — review and publish below when ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Input placeholder="Skill (e.g. React)" value={skill} onChange={(e) => setSkill(e.target.value)} data-testid="new-assessment-skill" />
          <Textarea
            placeholder="Open-ended prompt shown to the candidate"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            data-testid="new-assessment-prompt"
          />
          <Textarea
            placeholder="Grading rubric (never shown to the candidate)"
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            data-testid="new-assessment-rubric"
          />
          <Button onClick={create} disabled={pending} data-testid="create-skill-assessment">
            {pending ? "Creating…" : "Create draft"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <ul className="space-y-3" data-testid="skill-assessment-list">
        {assessments.map((a) => {
          const draft = editing[a.id];
          return (
            <li key={a.id}>
              <Card className="jb-lift" data-testid="skill-assessment-row">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">{a.skill}</CardTitle>
                    <Badge variant={a.status === "published" ? "default" : "secondary"} data-testid="skill-assessment-status">
                      {a.status}
                    </Badge>
                  </div>
                  <CardDescription>Created {formatDate(a.createdAt)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {draft ? (
                    <>
                      <Textarea
                        value={draft.prompt}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [a.id]: { ...prev[a.id]!, prompt: e.target.value } }))}
                      />
                      <Textarea
                        value={draft.rubric}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [a.id]: { ...prev[a.id]!, rubric: e.target.value } }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(a.id)} disabled={pending}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditing((prev) => {
                              const next = { ...prev };
                              delete next[a.id];
                              return next;
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">{a.prompt}</p>
                      <p className="text-xs text-muted-foreground">Rubric: {a.rubric}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing((prev) => ({ ...prev, [a.id]: { prompt: a.prompt, rubric: a.rubric } }))}
                        >
                          Edit
                        </Button>
                        {a.status === "draft" && (
                          <>
                            <Button size="sm" onClick={() => publish(a.id)} disabled={pending} data-testid="publish-skill-assessment">
                              Publish
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => discard(a.id)}
                              disabled={pending}
                              data-testid="discard-skill-assessment"
                            >
                              Discard
                            </Button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
