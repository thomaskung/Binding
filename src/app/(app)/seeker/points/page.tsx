import { Badge, CreditLedger, type CreditLedgerEntry } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/points";

/** Title-cases an underscore/space-separated fragment for display, e.g.
 * "profile revealed" -> "Profile revealed", "reveal_spend" -> "Reveal spend". */
function humanize(text: string): string {
  const spaced = text.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Points history — the SeekerDashboard template's "Points" tab, kept as its
 * own path route (founder decision: the view survives the chrome rule as a
 * dedicated page; no template exists, composed from the screen conventions).
 * Renders through the kit's CreditLedger (balance + credit/debit list) —
 * translated from the dashboard mockup's "Training credits" panel, the
 * closest authoritative reference for this widget shape. No goal/"Path"
 * panel: that roadmap feature has no backing data yet, so goalTitle is
 * deliberately left unset (CreditLedger omits the whole panel). */
export default async function SeekerPointsPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [balance, { data: ledger }, { data: profile }] = await Promise.all([
    getBalance(supabase, session.userId),
    supabase
      .from("points_ledger")
      .select("id, event, amount, note, created_at")
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("seeker_tier").eq("id", session.userId).maybeSingle(),
  ]);

  const isPro = profile?.seeker_tier === "pro";

  const entries: CreditLedgerEntry[] = (ledger ?? []).map((row) => ({
    id: row.id,
    label: row.note ? humanize(row.note) : humanize(row.event),
    note: new Date(row.created_at).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    amount: row.amount,
  }));

  return (
    <div className="jb-fade mx-auto max-w-2xl space-y-5 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
            Points
          </h1>
          {isPro && <Badge variant="outline">Pro</Badge>}
        </div>
        <Badge variant="secondary" data-testid="points-page-balance">
          {balance.toLocaleString()} points
        </Badge>
      </header>

      <CreditLedger
        label="Points"
        balance={balance.toLocaleString()}
        balanceNote="earned through activity — spent on reveals & training"
        entries={entries}
        emptyMessage="No points activity yet."
        footnote="Points are non-transferable and non-cash-redeemable — a closed-loop credit, never money."
      />
    </div>
  );
}
