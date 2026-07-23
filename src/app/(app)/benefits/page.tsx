import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { benefitTier, getLifetimeBenefitPoints } from "@/lib/benefits";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BenefitsCatalog } from "./benefits-catalog";

/** Benefits/loyalty discount catalog (DESIGN.md §7b, reframed 2026-07-21,
 * per-side formula added 2026-07-23 — LEGAL_REVIEW.md Q8: no stored value,
 * no payment nexus). Tier is a READ-ONLY signal — seekers from lifetime
 * points EARNED, recruiters/corporates (no earn mechanism) from lifetime
 * points SPENT — reaching/keeping it never debits the ledger; nothing here
 * is a spend or a checkout. */
export default async function BenefitsPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.onboarded) redirect("/onboarding");
  if (!session.isSeeker && !session.isRecruiter) redirect("/onboarding");

  // Dual-role: last-used role wins (same convention as "/" — see page.tsx),
  // falling back to seeker when both, else whichever role exists.
  const lastRole = (await cookies()).get("job_active_role")?.value;
  const role: "seeker" | "recruiter" =
    (lastRole === "recruiter" && session.isRecruiter) ||
    (session.isRecruiter && !session.isSeeker)
      ? "recruiter"
      : "seeker";

  const supabase = await createSupabaseServerClient();
  const [lifetimePoints, { data: partners }] = await Promise.all([
    getLifetimeBenefitPoints(supabase, session.userId, role),
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
        metricKind={role === "seeker" ? "earned" : "spent"}
        partners={partners ?? []}
      />
    </main>
  );
}
