import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";
import type { AvailableAssessment } from "./skill-assessment-actions";

interface Props {
  assessments: AvailableAssessment[];
}

/** Seeker dashboard widget (DESIGN.md §14b, Phase 12) — completes the
 * "Skill Assessment" widget Phase 2's dashboard-widget pass explicitly
 * deferred (CLAUDE.md: "needs the unbuilt ㉘ assessment feature, not just a
 * widget"). Honest binary status per assessment (passed/attempted/
 * available), never a numeric score — same qualitative-signal posture as
 * everywhere else in the product. */
export function SkillAssessmentCard({ assessments }: Props) {
  if (assessments.length === 0) return null;

  const passedCount = assessments.filter((a) => a.passed).length;

  return (
    <Card className="jb-lift" data-testid="skill-assessment-card">
      <CardHeader>
        <CardTitle>Skill assessments</CardTitle>
        <CardDescription data-testid="skill-assessment-summary">
          {passedCount} of {assessments.length} passed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {assessments.slice(0, 4).map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{a.skill}</span>
            {a.passed ? (
              <Badge variant="default">Passed</Badge>
            ) : a.attempted ? (
              <Badge variant="secondary">Not yet passed</Badge>
            ) : (
              <Badge variant="outline">Available</Badge>
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button size="sm" render={<Link href="/seeker/skill-assessments" />}>
          Take an assessment
        </Button>
      </CardFooter>
    </Card>
  );
}
