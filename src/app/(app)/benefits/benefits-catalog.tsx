"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@jumponboard/ui";
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
    <Card className="jb-lift" data-testid="benefit-partner-card">
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

export function BenefitsCatalog({ tier, lifetimePoints, metricKind, partners }: Props) {
  const [category, setCategory] = useState<string>("all");
  const { fraction, nextThreshold } = benefitTierProgress(lifetimePoints);
  const ringDeg = Math.round(fraction * 360);

  const categories = useMemo(
    () => Array.from(new Set(partners.map((p) => p.category))),
    [partners],
  );
  const visiblePartners =
    category === "all" ? partners : partners.filter((p) => p.category === category);

  return (
    <>
      <header className="jb-fade flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-medium tracking-tight">Benefits</h1>
        <p className="text-sm text-muted-foreground">
          Reached via {lifetimePoints} lifetime points {metricKind} — this is a read-only signal, never
          debits your points balance to reach or keep.
        </p>
      </header>

      <Card className="jb-lift">
        <CardContent className="flex items-center gap-4 py-6">
          <div
            className="flex size-20 flex-none items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--primary) ${ringDeg}deg, var(--muted) 0deg)`,
            }}
          >
            <div className="flex size-15 items-center justify-center rounded-full bg-card">
              <span className="font-heading text-lg font-medium">T{tier}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Badge data-testid="benefit-tier-badge" className="w-fit">
              Tier {tier}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {nextThreshold === null
                ? "Highest tier reached"
                : `${lifetimePoints} / ${nextThreshold} points ${metricKind} to next tier`}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={category === "all" ? "default" : "outline"}
          onClick={() => setCategory("all")}
        >
          All
        </Button>
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? "default" : "outline"}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABEL[c] ?? c}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {visiblePartners.map((p) => (
          <PartnerCard key={p.id} partner={p} unlocked={tier >= p.tier_required} />
        ))}
      </div>
    </>
  );
}
