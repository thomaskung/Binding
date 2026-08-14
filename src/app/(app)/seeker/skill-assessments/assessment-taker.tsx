"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@binding/ui";
import { submitAssessmentAttempt, type AvailableAssessment } from "../skill-assessment-actions";

interface Props {
  initialAssessments: AvailableAssessment[];
}

/** Attempt flow: pick an assessment, write an answer, submit. Result is
 * binary pass/fail only — never a numeric score, same qualitative-signal
 * posture as matchBand/reveal bands elsewhere. */
export function AssessmentTaker({ initialAssessments }: Props) {
  const [assessments, setAssessments] = useState(initialAssessments);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; passed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        const { passed } = await submitAssessmentAttempt(id, answer);
        setResult({ id, passed });
        setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, attempted: true, passed: a.passed || passed } : a)));
        setAnswer("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submission failed");
      }
    });
  }

  if (assessments.length === 0) {
    return <p className="text-sm text-muted-foreground">No assessments available yet.</p>;
  }

  return (
    <ul className="space-y-3" data-testid="assessment-list">
      {assessments.map((a) => (
        <li key={a.id}>
          <Card className="jb-lift" data-testid="assessment-row">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{a.skill}</CardTitle>
                {a.passed && (
                  <Badge variant="default" data-testid="assessment-passed-badge">
                    Passed
                  </Badge>
                )}
              </div>
              <CardDescription>{a.prompt}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {openId === a.id ? (
                <>
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Write your answer…"
                    rows={6}
                    data-testid="assessment-answer-input"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => submit(a.id)} disabled={pending} data-testid="submit-assessment-attempt">
                      {pending ? "Grading…" : "Submit"}
                    </Button>
                    <Button variant="ghost" onClick={() => setOpenId(null)}>
                      Cancel
                    </Button>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" data-testid="assessment-attempt-error">
                      {error}
                    </p>
                  )}
                  {result?.id === a.id && (
                    <p
                      className="text-sm"
                      data-testid={result.passed ? "assessment-result-pass" : "assessment-result-fail"}
                    >
                      {result.passed ? "Passed — nice work." : "Not a pass this time — you can try again."}
                    </p>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpenId(a.id);
                    setResult(null);
                    setError(null);
                  }}
                  data-testid="start-assessment-attempt"
                >
                  {a.attempted ? "Try again" : "Take assessment"}
                </Button>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
