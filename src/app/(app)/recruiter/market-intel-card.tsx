import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";
import type { SkillDemandRow } from "@/lib/market-signals";

interface Props {
  skillDemand: SkillDemandRow[];
}

/**
 * Market Intelligence dashboard widget (DESIGN.md §13f): a teaser for the
 * full /recruiter/market-intelligence product. Reads through the same
 * k-anonymized `fetchSkillDemand` RPC that page uses (src/lib/market-signals.ts)
 * — never a direct table query — so the same cohort-suppression floor
 * applies here. The top row may legitimately be suppressed on a thin
 * dataset; this widget must degrade to an honest "not enough data yet"
 * rather than ever rendering a below-threshold figure.
 */
export function MarketIntelCard({ skillDemand }: Props) {
  const topSkill = skillDemand.find((s) => !s.suppressed && s.seekerCount != null) ?? null;

  return (
    <Card className="jb-lift" data-testid="market-intel-card">
      <CardHeader>
        <CardTitle className="text-xl">Market intelligence</CardTitle>
        <CardDescription>
          {topSkill
            ? `${topSkill.skill} is the most in-demand skill right now`
            : "Not enough seeker data yet for a skill-demand signal"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topSkill ? (
          <Badge variant="outline">{topSkill.seekerCount} seekers</Badge>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aggregate signals unlock once enough seekers share a skill (k-anonymized — no individual
            candidate is ever identifiable in this view).
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/recruiter/market-intelligence" />}>
          View market intelligence →
        </Button>
      </CardFooter>
    </Card>
  );
}
