import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@binding/ui";
import type { AvailableAssessment } from "../skill-assessment-actions";

interface Props {
  assessments: AvailableAssessment[];
}

/** Learn & Verify (Binding.dc.html "verified skills", 18a): shows recruiters
 * a verified badge without needing a reveal. Passed rows sort first so a
 * seeker with more than 4 assessments never has an earned badge pushed off
 * the visible list by the cap — the cap only ever hides not-yet-attempted
 * rows. Badges don't currently expire (any passed=true attempt, ever, per
 * listAvailableAssessments' OR-across-attempts reduction) — a deliberate MVP
 * simplification; re-verification cadence is a roadmap item, not built here. */
export function VerifiedSkillsCard({ assessments }: Props) {
  if (assessments.length === 0) return null;

  const sorted = [...assessments].sort((a, b) => Number(b.passed) - Number(a.passed));
  const visible = sorted.slice(0, 4);

  return (
    <Card className="jb-lift" data-testid="verified-skills-card">
      <CardHeader>
        <CardTitle className="text-sm">Verified skills</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{a.skill}</span>
            {a.passed ? (
              <Badge variant="default" data-testid="verified-skill-badge">
                Verified
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                render={<Link href="/seeker/skill-assessments" />}
              >
                Verify
              </Button>
            )}
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          Recruiters see this badge without needing a reveal.
        </p>
      </CardContent>
    </Card>
  );
}
