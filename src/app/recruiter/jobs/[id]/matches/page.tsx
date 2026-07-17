import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { expireStaleOverride, OVERRIDE_COST } from "@/lib/points";
import { OverrideButton, RevealButton } from "./reveal-button";

export default async function JobMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("job_postings")
    .select("id, title, status")
    .eq("id", id)
    .eq("recruiter_id", session.userId)
    .maybeSingle();
  if (!job) notFound();

  const [{ data: matches }, { data: reveals }] = await Promise.all([
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
  ]);

  // Lazy expiry pass (7-day pending overrides become declines + refunds).
  const admin = createSupabaseAdminClient();
  const liveReveals = [];
  for (const r of reveals ?? []) {
    const expired = await expireStaleOverride(admin, {
      id: r.id,
      path: r.path,
      status: r.status,
      recruiter_id: r.recruiter_id,
      created_at: r.created_at,
      refunded: r.refunded,
    });
    liveReveals.push(expired ? { ...r, status: "declined" as const, refunded: true } : r);
  }

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

  const { data: candidateTexts } = await supabase.rpc("match_candidates", {
    p_job_id: id,
    p_threshold: 0,
    p_top_n: 100,
  });
  const textByProfile = new Map<string, string>(
    ((candidateTexts ?? []) as { profile_id: string; redacted_text: string }[]).map((c) => [
      c.profile_id,
      c.redacted_text,
    ]),
  );
  const revealByProfile = new Map(liveReveals.map((r) => [r.profile_id, r]));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Matches — {job.title}</h1>
          <p className="text-sm text-muted-foreground">
            Candidates are pseudonymized until you reveal. Standard reveal (10
            pts) needs candidate interest; override ({OVERRIDE_COST} pts)
            reveals immediately — messaging unlocks only if they accept.
          </p>
        </div>
        <Button variant="ghost" render={<Link href={`/recruiter/jobs/${id}`} />}>
          ← Job
        </Button>
      </header>

      {(matches ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No matches yet. Publish the job (with an embedded JD) and check back
            as candidates join the pool.
          </CardContent>
        </Card>
      ) : (
        (matches ?? []).map((match) => {
          const reveal = revealByProfile.get(match.profile_id);
          const revealedProfile = reveal
            ? (Array.isArray(reveal.profiles) ? reveal.profiles[0] : reveal.profiles)
            : null;
          const thread = reveal
            ? (Array.isArray(reveal.message_threads)
                ? reveal.message_threads[0]
                : reveal.message_threads)
            : null;
          const override = overrideInfo.get(match.profile_id);
          const overridePending = reveal?.path === "override" && reveal.status === "pending";
          const overrideDeclined = reveal?.path === "override" && reveal.status === "declined";
          return (
            <Card key={match.id} data-testid="recruiter-match-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  {match.status === "revealed" && revealedProfile ? (
                    <span data-testid="revealed-name">{revealedProfile.display_name}</span>
                  ) : (
                    <span className="text-muted-foreground">Pseudonymized candidate</span>
                  )}
                  <Badge variant="outline">{Math.round(match.score * 100)}% match</Badge>
                  <Badge
                    variant={
                      match.status === "interested"
                        ? "default"
                        : match.status === "revealed"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {overridePending
                      ? "revealed — awaiting response"
                      : overrideDeclined
                        ? "revealed — declined"
                        : match.status}
                  </Badge>
                </CardTitle>
                {match.status === "revealed" && reveal?.fit_summary && (
                  <CardDescription data-testid="fit-summary">{reveal.fit_summary}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">
                  {textByProfile.get(match.profile_id) ?? "(profile text unavailable)"}
                </p>
                {match.status === "interested" && <RevealButton matchId={match.id} />}
                {match.status === "surfaced" &&
                  (override?.allowed ? (
                    <OverrideButton matchId={match.id} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Waiting for the candidate to express interest.
                      {override?.reason ? ` Override unavailable: ${override.reason}.` : ""}
                    </p>
                  ))}
                {overridePending && (
                  <p className="text-xs text-muted-foreground" data-testid="override-pending-note">
                    Identity disclosed. Messaging stays locked until the candidate accepts —
                    they have 7 days; if they decline or it expires, 15 pts refund automatically.
                  </p>
                )}
                {overrideDeclined && (
                  <p className="text-xs text-muted-foreground" data-testid="override-declined-note">
                    Candidate declined the conversation. Your 15-pt premium was refunded; this
                    candidate can&apos;t be override-revealed again for 30 days.
                  </p>
                )}
                {match.status === "revealed" && reveal?.status === "accepted" && thread && (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="open-thread"
                    render={<Link href={`/thread/${thread.id}`} />}
                  >
                    Open conversation
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
