import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@binding/ui";
import {
  benefitTier,
  getLifetimeEarnedPoints,
  listBenefitPartnerUnlocks,
  loyaltyLadderRows,
} from "@/lib/benefits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface Props {
  lifetimePoints?: number;
  userId?: string;
  partnerUnlocks?: { tier_required: number }[];
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

/**
 * Loyalty ladder dashboard widget: shows current tier, progress toward next,
 * and per-tier unlock counts (grouped so each partner counts only at the tier
 * it actually unlocks at, not every tier below it). Server component that
 * optionally fetches its own data or accepts it as props.
 */
export async function LoyaltyLadderCard({ lifetimePoints, userId, partnerUnlocks: partnerUnlocksProp }: Props) {
  let points = lifetimePoints;
  let partnerUnlocks = partnerUnlocksProp;

  // Fetch anything the caller didn't already provide (loadSeekerContext
  // provides both today — this fallback only serves standalone/future use).
  if (points === undefined || partnerUnlocks === undefined) {
    const supabase = await createSupabaseServerClient();
    if (points === undefined) {
      points = userId ? await getLifetimeEarnedPoints(supabase, userId) : 0;
    }
    if (partnerUnlocks === undefined) {
      partnerUnlocks = await listBenefitPartnerUnlocks(supabase);
    }
  }

  const currentTier = benefitTier(points);
  const rows = loyaltyLadderRows(points, partnerUnlocks);

  const nextThresholdRow = rows.find((r) => !r.reached);
  const pointsToNextTier = nextThresholdRow
    ? nextThresholdRow.threshold - points
    : null;

  return (
    <Card className="jb-lift">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2.5">
          <CardTitle className="text-xl">Loyalty ladder</CardTitle>
          <Badge data-testid="loyalty-tier-badge">Tier {currentTier}</Badge>
        </div>
        <CardDescription>
          {points} lifetime points earned — tiers reflect activity, not purchases.{" "}
          {pointsToNextTier === null
            ? "Highest tier reached."
            : `${pointsToNextTier} points to next tier.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.tier}
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-3 transition-colors",
              row.current
                ? "border-primary bg-primary/5"
                : row.reached
                  ? "border-green-600/30 bg-green-600/5"
                  : "border-muted bg-muted/40",
            )}
          >
            <div className="flex flex-1 items-center gap-3">
              <div
                className={cn(
                  "flex size-8 flex-shrink-0 items-center justify-center rounded-full",
                  row.current
                    ? "bg-primary text-primary-foreground"
                    : row.reached
                      ? "bg-green-600/80 text-white"
                      : "bg-muted-foreground/30",
                )}
              >
                {row.reached ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <LockIcon className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={cn("font-medium", !row.reached && "text-muted-foreground")}>
                    Tier {row.tier}
                  </span>
                  {row.current && (
                    <span className="text-xs font-semibold text-primary">CURRENT</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.threshold}+ points earned
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-semibold">{row.unlockedPartnerCount}</div>
              <p className="text-xs text-muted-foreground">
                {row.unlockedPartnerCount === 1 ? "benefit" : "benefits"}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" render={<Link href="/benefits" />}>
          Benefits →
        </Button>
      </CardFooter>
    </Card>
  );
}
