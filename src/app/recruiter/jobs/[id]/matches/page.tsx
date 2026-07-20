import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { expireStaleOverride, getBalance, OVERRIDE_COST } from "@/lib/points";
import { MatchList, type RecruiterMatchCard } from "./match-list";

export default async function JobMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  // job/matches/reveals/candidateTexts/balance are independent of each other
  // (none needs another's result to run its query) — fetch all five
  // concurrently instead of chaining.
  const [{ data: job }, { data: matches }, { data: reveals }, { data: candidateTexts }, balance] =
    await Promise.all([
      supabase
        .from("job_postings")
        .select("id, title, status")
        .eq("id", id)
        .eq("recruiter_id", session.userId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("id, profile_id, score, status")
        .eq("job_posting_id", id)
        .order("score", { ascending: false }),
      supabase
        .from("reveal_requests")
        .select(
          "id, profile_id, path, status, refunded, created_at, recruiter_id, fit_summary, profiles!reveal_requests_profile_id_fkey(display_name), message_threads(id)",
        )
        .eq("job_posting_id", id),
      supabase.rpc("match_candidates", { p_job_id: id, p_threshold: 0, p_top_n: 100 }),
      getBalance(supabase, session.userId),
    ]);
  if (!job) notFound();

  // Lazy expiry pass (7-day pending overrides become declines + refunds).
  // Each check is independent and short-circuits with zero DB calls unless
  // actually a pending override past the window — run in parallel.
  const admin = createSupabaseAdminClient();
  const expiryResults = await Promise.all(
    (reveals ?? []).map((r) =>
      expireStaleOverride(admin, {
        id: r.id,
        path: r.path,
        status: r.status,
        recruiter_id: r.recruiter_id,
        created_at: r.created_at,
        refunded: r.refunded,
      }),
    ),
  );
  const liveReveals = (reveals ?? []).map((r, i) =>
    expiryResults[i] ? { ...r, status: "declined" as const, refunded: true } : r,
  );

  // Override availability hints for surfaced candidates (server-side only;
  // the action re-validates everything at spend time).
  const surfacedIds = (matches ?? [])
    .filter((m) => m.status === "surfaced")
    .map((m) => m.profile_id);
  const overrideInfo = new Map<string, { allowed: boolean; reason: string | null }>();
  if (surfacedIds.length > 0) {
    const [{ data: consents }, { data: candidateProfiles }] = await Promise.all([
      admin
        .from("consent_flags")
        .select("profile_id, reveal_override_enabled")
        .in("profile_id", surfacedIds),
      admin.from("profiles").select("id, visibility").in("id", surfacedIds),
    ]);
    const consentByProfile = new Map((consents ?? []).map((c) => [c.profile_id, c]));
    const visByProfile = new Map((candidateProfiles ?? []).map((p) => [p.id, p.visibility]));
    for (const pid of surfacedIds) {
      if (!consentByProfile.get(pid)?.reveal_override_enabled) {
        overrideInfo.set(pid, { allowed: false, reason: "candidate has disabled reveal-override" });
      } else if (visByProfile.get(pid) === "paused") {
        overrideInfo.set(pid, { allowed: false, reason: "candidate currently unavailable" });
      } else {
        overrideInfo.set(pid, { allowed: true, reason: null });
      }
    }
  }

  const textByProfile = new Map<string, string>(
    ((candidateTexts ?? []) as { profile_id: string; redacted_text: string }[]).map((c) => [
      c.profile_id,
      c.redacted_text,
    ]),
  );
  const revealByProfile = new Map(liveReveals.map((r) => [r.profile_id, r]));

  const cards: RecruiterMatchCard[] = (matches ?? []).map((match) => {
    const reveal = revealByProfile.get(match.profile_id);
    const revealedProfile = reveal
      ? Array.isArray(reveal.profiles)
        ? reveal.profiles[0]
        : reveal.profiles
      : null;
    const thread = reveal
      ? Array.isArray(reveal.message_threads)
        ? reveal.message_threads[0]
        : reveal.message_threads
      : null;
    const override = overrideInfo.get(match.profile_id);
    return {
      id: match.id,
      profileId: match.profile_id,
      score: match.score,
      status: match.status,
      revealedName: revealedProfile?.display_name ?? null,
      fitSummary: reveal?.fit_summary ?? null,
      text: textByProfile.get(match.profile_id) ?? "",
      overridePending: reveal?.path === "override" && reveal.status === "pending",
      overrideDeclined: reveal?.path === "override" && reveal.status === "declined",
      overrideAllowed: override?.allowed ?? false,
      overrideReason: override?.reason ?? null,
      threadOpen: reveal?.status === "accepted",
      threadId: thread?.id ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold">Matches — {job.title}</h1>
          <p className="text-sm text-muted-foreground">
            Candidates are pseudonymized until you reveal. Standard reveal (10
            pts) needs candidate interest; override ({OVERRIDE_COST} pts)
            reveals immediately — messaging unlocks only if they accept.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Badge variant="secondary">{balance} pts</Badge>
          <Button variant="ghost" render={<Link href={`/recruiter/jobs/${id}`} />}>
            ← Job
          </Button>
        </div>
      </header>

      <MatchList cards={cards} />
    </main>
  );
}
