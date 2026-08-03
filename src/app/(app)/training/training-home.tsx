"use client";

import { useTransition } from "react";
import { Badge, Button, Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";
import { completeAssignedTraining, completeTrainingProgram } from "./actions";

export interface TrainingProgramView {
  id: string;
  track: "career_path" | "compliance";
  type: "guided" | "ai_quiz";
  title: string;
  description: string;
  moduleCount: number;
  creditCost: number;
  completed: boolean;
}

export interface AssignedProgramView {
  id: string;
  title: string;
  description: string;
  moduleCount: number;
  completed: boolean;
}

interface Props {
  seekerTier: "free" | "pro";
  creditBalance: number;
  programs: TrainingProgramView[];
  assignments: AssignedProgramView[];
}

/** Training hub (TrainingHome template): the two tracks side by side —
 * individual career path and corporate compliance — with per-program credit
 * cost in each card footer. The template's "Sponsored" contextual-ad slot is
 * not built: no ad inventory exists, and a fake sponsor card would be
 * dishonest chrome. Completion mechanics (affordability gating, employer
 * assignments) are the real ones, not the template's inert Start buttons. */
export function TrainingHome({ seekerTier, creditBalance, programs, assignments }: Props) {
  const [pending, startTransition] = useTransition();

  function complete(programId: string) {
    startTransition(() => completeTrainingProgram(programId));
  }
  function completeAssigned(assignmentId: string) {
    startTransition(() => completeAssignedTraining(assignmentId));
  }

  function ProgramCard({ p }: { p: TrainingProgramView }) {
    const cost = seekerTier === "pro" ? 0 : p.creditCost;
    const canAfford = cost === 0 || creditBalance >= cost;
    return (
      <Card size="sm" data-testid="training-program-card">
        <CardHeader>
          <CardTitle className="text-[15px]">{p.title}</CardTitle>
          <CardDescription>
            {p.type === "guided"
              ? `Guided course · ${p.moduleCount} module${p.moduleCount === 1 ? "" : "s"}`
              : "AI quiz · adapts to your answers"}
          </CardDescription>
          <CardAction>
            <Badge variant={p.type === "guided" ? "outline" : "default"}>
              {p.type === "guided" ? "Guided" : "AI quiz"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[13px] text-muted-foreground">
              {cost === 0 ? "Free" : `${cost} credits`}
            </span>
            {p.completed ? (
              <Badge>Completed</Badge>
            ) : (
              <Button
                size="sm"
                disabled={pending || !canAfford}
                onClick={() => complete(p.id)}
                data-testid="complete-program"
              >
                {canAfford ? "Complete program" : "Need more credits"}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    );
  }

  const careerPrograms = programs.filter((p) => p.track === "career_path");
  const compliancePrograms = programs.filter((p) => p.track === "compliance");

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-tight">Training</h1>
          <p className="text-sm text-muted-foreground">
            Guided courses and AI quizzes — spend credits, build your profile
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary">{creditBalance} credits</Badge>
          {seekerTier === "pro" && <Badge variant="outline">Pro — programs free</Badge>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[15px] font-semibold tracking-tight">Career path</h3>
          <p className="mb-3.5 text-[13px] text-muted-foreground">
            Individual growth — skills, offers, and interview readiness
          </p>
          <div className="flex flex-col gap-3.5">
            {careerPrograms.map((p) => (
              <ProgramCard key={p.id} p={p} />
            ))}
            {careerPrograms.length === 0 && (
              <p className="text-sm text-muted-foreground">No career-path programs yet.</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-[15px] font-semibold tracking-tight">Compliance training</h3>
          <p className="mb-3.5 text-[13px] text-muted-foreground">
            Corporate — AML and security modules assigned by your organization
          </p>
          <div className="flex flex-col gap-3.5">
            {assignments.length > 0 && (
              <Card size="sm" data-testid="assigned-training-card">
                <CardHeader>
                  <CardTitle className="text-[15px]">Assigned by your employer</CardTitle>
                  <CardDescription>Licensed programs, no credits involved.</CardDescription>
                </CardHeader>
                <CardFooter className="flex-col items-stretch gap-2">
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{a.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {a.moduleCount} module{a.moduleCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {a.completed ? (
                        <Badge>Completed</Badge>
                      ) : (
                        <Button size="sm" disabled={pending} onClick={() => completeAssigned(a.id)}>
                          Mark complete
                        </Button>
                      )}
                    </div>
                  ))}
                </CardFooter>
              </Card>
            )}
            {compliancePrograms.map((p) => (
              <ProgramCard key={p.id} p={p} />
            ))}
            {compliancePrograms.length === 0 && assignments.length === 0 && (
              <p className="text-sm text-muted-foreground">No compliance programs yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
