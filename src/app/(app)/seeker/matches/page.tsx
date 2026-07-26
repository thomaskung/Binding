import { requireRole } from "@/lib/auth";
import { MatchList } from "../match-list";
import { loadSeekerContext, OverrideBanners } from "../seeker-data";

/** Job-matches list at its own path route (mockup nav "Job" item) —
 * previously /seeker?view=matches; path-segment routing per founder's
 * no-query-param rule. */
export default async function SeekerMatchesPage() {
  const session = await requireRole("seeker");
  const context = await loadSeekerContext(session.userId);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-14">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight">Your matches</h1>
        <p className="text-[15px] text-muted-foreground">
          {context.cards.length} role{context.cards.length === 1 ? "" : "s"} matched to your profile
        </p>
      </header>
      <OverrideBanners context={context} />
      <MatchList cards={context.cards} />
    </main>
  );
}
