"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card data-testid="benefit-partner-card">
      <CardHeader>
        <CardTitle className="text-base">{partner.partner_name}</CardTitle>
        <CardDescription>{partner.discount_description}</CardDescription>
        <CardAction>
          <Badge variant="outline">{CATEGORY_LABEL[partner.category] ?? partner.category}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!unlocked ? (
          <p className="text-sm text-muted-foreground">Reach Tier {partner.tier_required} to unlock.</p>
        ) : revealed ? (
          <div className="space-y-2">
            <p className="rounded-md border px-3 py-2 font-mono text-sm" data-testid="benefit-code">
              {partner.code}
            </p>
            <p className="text-xs text-muted-foreground">
              You&apos;ll pay {partner.partner_name} directly on their site — JumpOnBoard never
              processes this payment.
            </p>
          </div>
        ) : (
          <Button size="sm" data-testid="get-code" onClick={() => setRevealed(true)}>
            Get code
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function BenefitsCatalog({ tier, lifetimePoints, partners }: Props) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Benefits</h1>
          <Badge data-testid="benefit-tier-badge">Tier {tier}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Reached via {lifetimePoints} lifetime points earned — this is a read-only signal, never a
          spend; your points balance is untouched.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        {partners.map((p) => (
          <PartnerCard key={p.id} partner={p} unlocked={tier >= p.tier_required} />
        ))}
      </div>
    </>
  );
}
