"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@binding/ui";
import { COMPANY_RESEARCH_DISCLAIMER } from "@/lib/company-research";
import { getCompanyResearch } from "../../company-research-actions";

interface Props {
  jobId: string;
  companyName: string;
}

/** AI Company Research panel (DESIGN.md §14k, Phase 14) — opt-in (button
 * click), not auto-fetched on page load: a real, non-trivial AI + web-search
 * cost per company, so it only runs when the seeker actually wants it. A
 * second click after the first (cache hit) resolves instantly with zero
 * additional cost — the caller can't tell the difference from this
 * component's perspective, which is the point. */
export function CompanyResearch({ jobId, companyName }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function research() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getCompanyResearch(jobId);
        setSummary(result.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Research failed");
      }
    });
  }

  return (
    <Card className="jb-lift" data-testid="company-research-card">
      <CardHeader>
        <CardTitle className="text-sm">About {companyName}</CardTitle>
        <CardDescription>AI-researched public information to help you evaluate this role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="company-research-summary">
              {summary}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="company-research-disclaimer">
              {COMPANY_RESEARCH_DISCLAIMER}
            </p>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={research} disabled={pending} data-testid="research-company">
            {pending ? "Researching…" : "Research this company"}
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
