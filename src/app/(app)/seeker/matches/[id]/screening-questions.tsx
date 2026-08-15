"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@binding/ui";
import { submitScreeningAnswer, type CandidateScreeningQuestion } from "../../screening-actions";

interface Props {
  jobId: string;
  initialQuestions: CandidateScreeningQuestion[];
}

/** Candidate-facing screening-question answer flow (DESIGN.md §14c, Phase
 * 13) — binary pass/fail result only, same qualitative-signal posture as
 * skill-assessment's AssessmentTaker. Renders nothing if the job has no
 * published screening questions (caller passes an empty array in that case). */
export function ScreeningQuestions({ jobId, initialQuestions }: Props) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; passed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (questions.length === 0) return null;

  function submit(questionId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const { passed } = await submitScreeningAnswer(jobId, questionId, answer);
        setResult({ id: questionId, passed });
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, answered: true, passed } : q)));
        setAnswer("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submission failed");
      }
    });
  }

  return (
    <Card className="jb-lift" data-testid="screening-questions-card">
      <CardHeader>
        <CardTitle className="text-sm">Screening questions</CardTitle>
        <CardDescription>
          This recruiter asks a few open-ended questions for this role — answers are graded, not scored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {questions.map((q) => (
          <div key={q.id} data-testid="screening-question-row" className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">{q.question}</p>
              {q.answered && (
                <Badge
                  variant={q.passed ? "default" : "secondary"}
                  data-testid={q.passed ? "screening-answer-pass" : "screening-answer-fail"}
                >
                  {q.passed ? "Passed" : "Answered"}
                </Badge>
              )}
            </div>
            {openId === q.id ? (
              <>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your answer…"
                  rows={4}
                  data-testid="screening-answer-input"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => submit(q.id)} disabled={pending} data-testid="submit-screening-answer">
                    {pending ? "Grading…" : "Submit"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                    Cancel
                  </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {result?.id === q.id && (
                  <p className="text-sm">{result.passed ? "Passed — nice work." : "Not a pass this time — you can try again."}</p>
                )}
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenId(q.id);
                  setResult(null);
                  setError(null);
                }}
                data-testid="start-screening-answer"
              >
                {q.answered ? "Try again" : "Answer"}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
