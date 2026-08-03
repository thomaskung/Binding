"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Separator } from "@binding/ui";
import { benefitTierProgress } from "@/lib/benefits";

interface Partner {
  id: string;
  partner_name: string;
  category: string;
  discount_description: string;
  code: string;
  tier_required: number;
}

interface Props {
  tier: number;
  lifetimePoints: number;
  metricKind: "earned" | "spent";
  partners: Partner[];
}

const CATEGORY_LABEL: Record<string, string> = {
  flights: "Flights",
  accommodation: "Accommodation",
  wellness: "Wellness",
  it_equipment: "IT equipment",
  healthcare: "Healthcare",
  career_advisory: "Career advisory",
};

function PartnerCard({ partner, unlocked }: { partner: Partner; unlocked: boolean }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Card size="sm" data-testid="benefit-partner-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[15px]">{partner.partner_name}</CardTitle>
          <Badge variant="outline">{CATEGORY_LABEL[partner.category] ?? partner.category}</Badge>
        </div>
        <CardDescription>{partner.discount_description}</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent>
        {!unlocked ? (
          <span className="text-xs text-muted-foreground">
            Reach Tier {partner.tier_required} to unlock.
          </span>
        ) : revealed ? (
          <div className="flex flex-col gap-2">
            <span
              className="inline-block w-fit rounded-md bg-muted px-2.5 py-1.5 font-mono text-[15px] tracking-wide"
              data-testid="benefit-code"
            >
              {partner.code}
            </span>
            <span className="text-xs leading-normal text-muted-foreground">
              You&apos;ll pay {partner.partner_name} directly on their site — JumpOnBoard never
              processes this payment.
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Same code for everyone at your tier — no personal tracking
          </span>
        )}
      </CardContent>
      <CardFooter>
        <Button
          variant={revealed || !unlocked ? "outline" : "default"}
          size="sm"
          className="w-full"
          disabled={!unlocked || revealed}
          data-testid={unlocked && !revealed ? "get-code" : undefined}
          onClick={() => setRevealed(true)}
        >
          {!unlocked ? `Unlocks at Tier ${partner.tier_required}` : revealed ? "Code revealed" : "Get code"}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** Benefits & loyalty catalog (BenefitsCatalog template): tenure-based tier
 * header card — never purchased, no currency — and a partner-discount grid
 * where every card ends at a redirect-out code reveal, never a checkout
 * (LEGAL_REVIEW Q8). Tier-locked cards are real (benefit_partners.min_tier),
 * an app mechanic the template's demo data doesn't show. */
export function BenefitsCatalog({ tier, lifetimePoints, metricKind, partners }: Props) {
  const { nextThreshold } = benefitTierProgress(lifetimePoints);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-2.5">
            <CardTitle className="text-xl">Benefits &amp; discounts</CardTitle>
            <Badge data-testid="benefit-tier-badge">Tier {tier}</Badge>
          </div>
          <CardDescription>
            Reached via {lifetimePoints} lifetime points {metricKind} — tiers reflect activity, not
            purchases.{" "}
            {nextThreshold === null
              ? "Highest tier reached."
              : `${lifetimePoints} / ${nextThreshold} points ${metricKind} to next tier.`}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {partners.map((p) => (
          <PartnerCard key={p.id} partner={p} unlocked={tier >= p.tier_required} />
        ))}
      </div>
    </>
  );
}
