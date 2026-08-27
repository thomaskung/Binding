import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button } from "@binding/ui";
import { requireRole } from "@/lib/auth";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import {
  expireStaleOverride,
  getBalance,
  OVERRIDE_COST,
  OVERRIDE_PREMIUM_REFUND,
  REVEAL_COST,
  revealCostForRank,
} from "@/lib/points";
import { MatchesView } from "./matches-view";
import { type RecruiterMatchCard } from "./match-list";

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
        .select("id, title, status, skills")
        .eq("id", id)
        .eq("recruiter_id", session.userId)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("id, profile_id, score, status, interested_at")
        .eq("job_posting_id", id)
        .order("score", { ascending: false }),
      supabase
        .from("reveal_requests")
        .select(
          "id, profile_id, path, status, refunded, premium_refund, created_at, recruiter_id, fit_summary, profiles!reveal_requests_profile_id_fkey(display_name), message_threads(id)",
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
        premium_refund: r.premium_refund,
      }),
    ),
  );
  const liveReveals = (reveals ?? []).map((r, i) =>
    expiryResults[i] ? { ...r, status: "declined" as const, refunded: true } : r,
  );
  // Every reveal_requests row for this job counts toward the same-role
  // discount rank (§4a) regardless of path — mirrors countRevealsForJob.
  // Next reveal (from either RevealButton or Compare) would be this rank.
  const alreadyRevealedForJobCount = liveReveals.length;
  const nextRevealRank = alreadyRevealedForJobCount + 1;

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

  // Verified-skill chips for every matched candidate (not just surfaced —
  // separate gate from overrideInfo above). Deliberately a standalone query,
  // not an extension of match_candidates: that RPC excludes candidates by
  // threshold/top-N, which would silently break "Verified skills only" for
  // any matched-but-RPC-excluded candidate. profiles.visibility = 'active'
  // scoping mirrors match_candidates' own pseudonymization boundary — a
  // paused candidate's card already renders blank via the strength-row
  // fallback below, and chips must not route around that via this new path.
  const matchedProfileIds = (matches ?? []).map((m) => m.profile_id);
  const verifiedByProfile = new Map<string, string[]>();
  if (matchedProfileIds.length > 0) {
    const { data: verifiedRows } = await admin
      .from("assessment_attempts")
      .select("profile_id, skill_assessments!inner(skill), profiles!inner(visibility)")
      .eq("passed", true)
      .eq("skill_assessments.status", "published")
      .eq("profiles.visibility", "active")
      .in("profile_id", matchedProfileIds);
    const skillSetByProfile = new Map<string, Set<string>>();
    for (const row of (verifiedRows ?? []) as unknown as {
      profile_id: string;
      skill_assessments: { skill: string } | { skill: string }[];
    }[]) {
      const sa = Array.isArray(row.skill_assessments) ? row.skill_assessments[0] : row.skill_assessments;
      if (!sa?.skill) continue;
      const set = skillSetByProfile.get(row.profile_id) ?? new Set<string>();
      set.add(sa.skill);
      skillSetByProfile.set(row.profile_id, set);
    }
    for (const [pid, set] of skillSetByProfile) verifiedByProfile.set(pid, Array.from(set));
  }

  interface StrengthRow {
    profile_id: string;
    redacted_text: string;
    seniority_band: string | null;
    years_experience: number | null;
    skills: string[] | null;
    industries: string[] | null;
    desired_roles: string[] | null;
    region: string | null;
    credentials_summary: string | null;
  }
  const strengthByProfile = new Map<string, StrengthRow>(
    ((candidateTexts ?? []) as StrengthRow[]).map((c) => [c.profile_id, c]),
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
    const strength = strengthByProfile.get(match.profile_id);
    return {
      id: match.id,
      profileId: match.profile_id,
      score: match.score,
      status: match.status,
      revealedName: revealedProfile?.display_name ?? null,
      fitSummary: reveal?.fit_summary ?? null,
      text: strength?.redacted_text ?? "",
      seniorityBand: strength?.seniority_band ?? null,
      yearsExperience: strength?.years_experience ?? null,
      skills: strength?.skills ?? [],
      industries: strength?.industries ?? [],
      desiredRoles: strength?.desired_roles ?? [],
      region: strength?.region ?? null,
      credentialsSummary: strength?.credentials_summary ?? null,
      interestedAt: match.interested_at ?? null,
      // Match-quality pricing (§4a) + same-role discount (rank 2+, applied
      // globally to every reveal path): interested → standard, surfaced →
      // override. nextRevealRank is what this reveal would cost right now —
      // the actual charge is recomputed server-side at spend time.
      revealCost: revealCostForRank(
        match.status === "interested" ? REVEAL_COST : OVERRIDE_COST,
        match.score,
        nextRevealRank,
      ),
      overrideRefund: revealCostForRank(OVERRIDE_PREMIUM_REFUND, match.score, nextRevealRank),
      revealRequestId: reveal?.id ?? null,
      overridePending: reveal?.path === "override" && reveal.status === "pending",
      overrideDeclined: reveal?.path === "override" && reveal.status === "declined",
      overrideAllowed: override?.allowed ?? false,
      overrideReason: override?.reason ?? null,
      threadOpen: reveal?.status === "accepted",
      threadId: thread?.id ?? null,
      verifiedSkills: verifiedByProfile.get(match.profile_id) ?? [],
    };
  });

  return (
    <main className="jb-fade mx-auto max-w-6xl space-y-6 px-6 py-14">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Job pipeline
          </p>
          <h1 className="font-heading text-[28px] font-medium leading-tight tracking-tight">
            {job.title}
          </h1>
          <p className="max-w-2xl text-[13.5px] text-muted-foreground">
            Candidates are pseudonymized until you reveal. Standard reveal (10 pts) needs candidate
            interest; override ({OVERRIDE_COST} pts) reveals immediately — messaging unlocks only if
            they accept.
            {alreadyRevealedForJobCount > 0 &&
              ` Your next reveal for this role gets the same-role discount (${alreadyRevealedForJobCount} already revealed).`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Badge variant="secondary">{balance} pts</Badge>
          <Button variant="ghost" size="sm" render={<Link href={`/recruiter/jobs/${id}`} />}>
            ← Job
          </Button>
        </div>
      </header>

      <MatchesView cards={cards} jobSkills={job.skills ?? []} />
    </main>
  );
}
