import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@jumponboard/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/points";

/** Points history — the SeekerDashboard template's "Points" tab, kept as its
 * own path route (founder decision: the view survives the chrome rule as a
 * dedicated page; no template exists, composed from the screen conventions). */
export default async function SeekerPointsPage() {
  const session = await requireRole("seeker");
  const supabase = await createSupabaseServerClient();

  const [balance, { data: ledger }] = await Promise.all([
    getBalance(supabase, session.userId),
    supabase
      .from("points_ledger")
      .select("id, event, amount, note, created_at")
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-tight">Points</h1>
        <Badge variant="secondary" data-testid="points-page-balance">
          {balance.toLocaleString()} points
        </Badge>
      </header>
      <p className="-mt-4 text-sm text-muted-foreground">
        Earned through platform activity — spent on reveals and training.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Every earn and spend, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(ledger ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No points activity yet.</p>
          )}
          {(ledger ?? []).map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{row.note || row.event.replaceAll("_", " ")}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString("en", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <span className="flex-none font-medium tabular-nums">
                {row.amount > 0 ? `+${row.amount}` : row.amount}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
