import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RevealButton } from "./reveal-button";

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
      .select("id, profile_id, fit_summary, profiles!reveal_requests_profile_id_fkey(display_name), message_threads(id)")
      .eq("job_posting_id", id),
  ]);

  // Pseudonymized candidate text comes via the RPC-backed matches; for
  // display we re-fetch each matched vector's redacted text through the
  // security-definer RPC results already persisted in `matches` + reveals.
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
  const revealByProfile = new Map(
    (reveals ?? []).map((r) => [r.profile_id, r]),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Matches — {job.title}</h1>
          <p className="text-sm text-muted-foreground">
            Candidates are pseudonymized until you reveal. Reveal requires the
            candidate to have expressed interest (10 pts, per role).
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
                    {match.status}
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
                {match.status === "revealed" && thread && (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="open-thread"
                    render={<Link href={`/thread/${thread.id}`} />}
                  >
                    Open conversation
                  </Button>
                )}
                {match.status === "surfaced" && (
                  <p className="text-xs text-muted-foreground">
                    Waiting for the candidate to express interest. (Paid
                    override for non-opted-in candidates ships post-MVP.)
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
