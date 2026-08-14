import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";
import { benefitsSummary } from "@/lib/benefits";

interface Props {
  lifetimePoints: number;
  partnerUnlocks: { tier_required: number }[];
}

/**
 * Benefits dashboard widget (DESIGN.md §13f) — a catalog-facing teaser,
 * distinct from `LoyaltyLadderCard` (which shows tier progression): this one
 * answers "what can I redeem right now." Pure derivation via
 * `benefitsSummary` from the same lifetime-points + partner-tier data
 * `loadSeekerContext` already fetches for the ladder widget — no new query.
 */
export function BenefitsSummaryCard({ lifetimePoints, partnerUnlocks }: Props) {
  const { tier, unlockedCount, lockedCount } = benefitsSummary(lifetimePoints, partnerUnlocks);

  return (
    <Card className="jb-lift" data-testid="benefits-summary-card">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2.5">
          <CardTitle className="text-xl">Benefits</CardTitle>
          <Badge variant="outline">Tier {tier}</Badge>
        </div>
        <CardDescription>
          {unlockedCount} partner benefit{unlockedCount === 1 ? "" : "s"} unlocked at your tier
          {lockedCount > 0
            ? ` — ${lockedCount} more unlock${lockedCount === 1 ? "s" : ""} at a higher tier.`
            : "."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Discounts and perks from training and services partners, unlocked by activity — never
          purchased.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/benefits" />}>
          View benefits →
        </Button>
      </CardFooter>
    </Card>
  );
}
