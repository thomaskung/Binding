import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@binding/ui";
import { benefitsSummary, getLifetimeEarnedPoints, listBenefitPartnerUnlocks } from "@/lib/benefits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface Props {
  lifetimePoints?: number;
  userId?: string;
  partnerUnlocks?: { tier_required: number }[];
}

/**
 * Benefits dashboard widget (DESIGN.md §13f) — a catalog-facing teaser,
 * distinct from `LoyaltyLadderCard` (which shows tier progression): this one
 * answers "what can I redeem right now." Pure derivation via
 * `benefitsSummary` from the same lifetime-points + partner-tier data the
 * ladder widget already has — no new query when the caller (loadSeekerContext)
 * supplies both. Self-fetches anything omitted, for standalone/future use.
 */
export async function BenefitsSummaryCard({ lifetimePoints, userId, partnerUnlocks: partnerUnlocksProp }: Props) {
  let points = lifetimePoints;
  let partnerUnlocks = partnerUnlocksProp;

  if (points === undefined || partnerUnlocks === undefined) {
    const supabase = await createSupabaseServerClient();
    if (points === undefined) {
      points = userId ? await getLifetimeEarnedPoints(supabase, userId) : 0;
    }
    if (partnerUnlocks === undefined) {
      partnerUnlocks = await listBenefitPartnerUnlocks(supabase);
    }
  }

  const { tier, unlockedCount, lockedCount } = benefitsSummary(points, partnerUnlocks);

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
