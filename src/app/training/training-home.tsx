"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TRACK_LABEL = { career_path: "Career path", compliance: "Compliance" } as const;

export function TrainingHome({ seekerTier, creditBalance, programs, assignments }: Props) {
  const [track, setTrack] = useState<"career_path" | "compliance">("career_path");
  const [pending, startTransition] = useTransition();

  const visible = programs.filter((p) => p.track === track);

  function complete(programId: string) {
    startTransition(() => completeTrainingProgram(programId));
  }
  function completeAssigned(assignmentId: string) {
    startTransition(() => completeAssignedTraining(assignmentId));
  }

  return (
    <>
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="text-sm text-muted-foreground">
            Career-path and compliance programs. Complete a program to earn credits and points.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary">{creditBalance} credits</Badge>
          {seekerTier === "pro" && <Badge variant="outline">Pro — programs free</Badge>}
        </div>
      </header>

      {assignments.length > 0 && (
        <Card data-testid="assigned-training-card">
          <CardHeader>
            <CardTitle>Assigned by your employer</CardTitle>
            <CardDescription>Licensed programs, no credits involved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.moduleCount} modules</p>
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
          </CardContent>
        </Card>
      )}

      <Separator />

      <Tabs value={track} onValueChange={(v) => setTrack(v as "career_path" | "compliance")}>
        <TabsList variant="line">
          <TabsTrigger value="career_path">Career path</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        {visible.map((p) => {
          const cost = seekerTier === "pro" ? 0 : p.creditCost;
          const canAfford = cost === 0 || creditBalance >= cost;
          return (
            <Card key={p.id} data-testid="training-program-card">
              <CardHeader>
                <CardTitle className="text-base">{p.title}</CardTitle>
                <CardDescription>{p.description}</CardDescription>
                <CardAction>
                  <Badge variant="outline">{TRACK_LABEL[p.track]}</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{p.moduleCount} modules</span>
                <div className="flex items-center gap-2">
                  {p.completed ? (
                    <Badge>Completed</Badge>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {cost === 0 ? "Free" : `${cost} credits`}
                      </span>
                      <Button
                        size="sm"
                        disabled={pending || !canAfford}
                        onClick={() => complete(p.id)}
                        data-testid="complete-program"
                      >
                        {canAfford ? "Complete program" : "Need more credits"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No {TRACK_LABEL[track].toLowerCase()} programs yet.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
