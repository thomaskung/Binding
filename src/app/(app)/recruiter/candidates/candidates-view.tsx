"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@binding/ui";
import { EnterprisePipelineBoard } from "./enterprise-pipeline-board";
import { PipelineList, type PipelineCard } from "./pipeline-list";

type ViewMode = "matches" | "pipeline";

/** Wraps the real candidate list with an Enterprise-pill "Pipeline" tab
 * (Binding.dc.html "RECRUITER · CANDIDATES", the Postings/Pipeline
 * switcher) — Pipeline is a static mock/preview, not a live feature. */
export function CandidatesView({ cards }: { cards: PipelineCard[] }) {
  const [mode, setMode] = useState<ViewMode>("matches");

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
        <TabsList variant="line">
          <TabsTrigger value="matches" data-testid="candidates-view-matches">
            Candidates
          </TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="candidates-view-pipeline">
            <span className="inline-flex items-center gap-1.5">
              Pipeline
              <span
                className="rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
                style={{ color: "var(--primary)", background: "var(--accent)" }}
              >
                Enterprise
              </span>
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "pipeline" ? <EnterprisePipelineBoard /> : <PipelineList cards={cards} />}
    </div>
  );
}
