import { benefitTier, getLifetimeEarnedPoints } from "@/lib/benefits";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BenefitsCatalog } from "./benefits-catalog";

/** Benefits/loyalty discount catalog (DESIGN.md §7b, reframed 2026-07-21 —
 * LEGAL_REVIEW.md Q8: no stored value, no payment nexus). Tier is a
 * READ-ONLY signal from lifetime points EARNED — reaching/keeping it never
 * debits the ledger; nothing here is a spend or a checkout. */
export default async function BenefitsPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [lifetimePoints, { data: partners }] = await Promise.all([
    getLifetimeEarnedPoints(supabase, session.userId),
    supabase
      .from("benefit_partners")
      .select("id, partner_name, category, discount_description, code, tier_required")
      .order("tier_required")
      .order("partner_name"),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <BenefitsCatalog
        tier={benefitTier(lifetimePoints)}
        lifetimePoints={lifetimePoints}
        partners={partners ?? []}
      />
    </main>
  );
}
