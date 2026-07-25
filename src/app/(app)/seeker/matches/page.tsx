import { requireRole } from "@/lib/auth";
import { MatchList } from "../match-list";
import { loadSeekerContext, SeekerBanners } from "../seeker-data";

/** Job-matches list at its own path route (mockup nav "Job" item) —
 * previously /seeker?view=matches; path-segment routing per founder's
 * no-query-param rule. */
export default async function SeekerMatchesPage() {
  const session = await requireRole("seeker");
  const context = await loadSeekerContext(session.userId);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-tight">Job matches</h1>
        <p className="text-sm text-muted-foreground">
          {context.cards.length} role{context.cards.length === 1 ? "" : "s"} matched to your profile
        </p>
      </header>
      <SeekerBanners context={context} />
      <MatchList cards={context.cards} />
    </main>
  );
}
