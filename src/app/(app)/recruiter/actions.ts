"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertJDTextOnly, getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { parseCommaList, parseLineList } from "@/lib/jobs";
import { refreshMatchesForJob } from "@/lib/matching";
import { logPiiAccess } from "@/lib/pii-audit";
import {
  appendLedger,
  countOverridesToday,
  countRevealsForJob,
  countStandardRevealsToday,
  getBalance,
  isOverrideBlocked,
  OVERRIDE_COMPENSATION,
  OVERRIDE_COST,
  OVERRIDE_DAILY_CAP,
  OVERRIDE_PREMIUM_REFUND,
  REVEAL_COMPENSATION,
  REVEAL_COST,
  REVEAL_DAILY_CAP,
  revealCostForRank,
  revealSpendGuard,
} from "@/lib/points";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Save recruiter identity + company profile fields. */
export async function saveRecruiterProfile(formData: FormData) {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: String(formData.get("display_name") ?? "").trim(),
      recruiter_title: String(formData.get("recruiter_title") ?? "").trim() || null,
      company_name: String(formData.get("company_name") ?? "").trim() || null,
      company_industry: String(formData.get("company_industry") ?? "").trim() || null,
      company_size: String(formData.get("company_size") ?? "") || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
    })
    .eq("id", session.userId);
  if (error) throw new Error(`profile save failed: ${error.message}`);
  revalidatePath("/recruiter/profile");
}

export async function saveJob(formData: FormData) {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();

  const id = formData.get("id") ? String(formData.get("id")) : null;
  const values = {
    recruiter_id: session.userId,
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    salary_min: formData.get("salary_min") ? Number(formData.get("salary_min")) : null,
    salary_max: formData.get("salary_max") ? Number(formData.get("salary_max")) : null,
    work_setups: formData.getAll("work_setups").map(String),
    department: String(formData.get("department") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    employment_type: String(formData.get("employment_type") ?? "fulltime"),
    salary_visibility: String(formData.get("salary_visibility") ?? "public"),
    offers_equity: formData.get("offers_equity") === "on",
    skills: parseCommaList(String(formData.get("skills") ?? "")),
    responsibilities: parseLineList(String(formData.get("responsibilities") ?? "")),
    requirements: parseLineList(String(formData.get("requirements") ?? "")),
  };
  if (!values.title || !values.description) throw new Error("title and description required");
  // Salary is mandatory at posting time (DESIGN §4a); job_postings.salary_min/
  // salary_max are NOT NULL since migration 0024.
  if (values.salary_min == null || values.salary_max == null)
    throw new Error("both salary bounds are required");
  if (values.salary_min > values.salary_max)
    throw new Error("minimum salary must not exceed maximum");

  if (id) {
    const { error } = await supabase.from("job_postings").update(values).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath(`/recruiter/jobs/${id}`);
    return;
  }
  const { data, error } = await supabase
    .from("job_postings")
    .insert(values)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/recruiter/jobs/${data.id}`);
}

/** Activate (publish) a job: embed the JD, set active, refresh matches.
 * Also the re-embed path when an active job's JD was edited. */
export async function publishJob(jobId: string) {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const ai = getAiProvider();

  const { data: job, error } = await supabase
    .from("job_postings")
    .select("id, title, description, recruiter_id")
    .eq("id", jobId)
    .single();
  if (error || job.recruiter_id !== session.userId) throw new Error("job not found");

  const embedding = await ai.embed(`${job.title}\n\n${job.description}`);
  const { error: updateError } = await admin
    .from("job_postings")
    .update({ embedding: JSON.stringify(embedding), status: "active" })
    .eq("id", jobId);
  if (updateError) throw new Error(updateError.message);

  await refreshMatchesForJob(admin, jobId);
  revalidatePath(`/recruiter/jobs/${jobId}`);
  revalidatePath("/recruiter");
}

export async function closeJob(jobId: string) {
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("job_postings")
    .update({ status: "closed" })
    .eq("id", jobId)
    .eq("recruiter_id", session.userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/recruiter/jobs/${jobId}`);
  revalidatePath("/recruiter");
}

/** JD refinement. JDs are recruiter-authored (not candidate-derived), so this
 * is the one flow allowed to use a frontier API later — hence the branded
 * JDTextOnly boundary. Match-context-aware refinement must stay private-path. */
export async function refineJobText(recruiterAuthoredJd: string): Promise<string> {
  await requireRole("recruiter");
  const ai = getAiProvider();
  return ai.refineJobDescription(assertJDTextOnly(recruiterAuthoredJd));
}

interface RevealJobInfo {
  recruiter_id: string;
  title: string;
  description: string;
}

/** Shared reveal core: fit summary (private AI path only) -> insert
 * reveal_requests -> ledger debit/credit -> mark match revealed -> open
 * thread -> audit the identity disclosure. Used by both the single-candidate
 * actions and bulkRevealCandidates so every reveal path stays in lockstep. */
async function performReveal(
  admin: SupabaseClient,
  params: {
    matchId: string;
    profileId: string;
    jobPostingId: string;
    job: RevealJobInfo;
    recruiterId: string;
    path: "standard" | "override";
    cost: number;
    compensation: number;
    score: number;
    premiumRefund?: number;
  },
): Promise<string> {
  const { data: vector } = await admin
    .from("skill_vectors")
    .select("redacted_text")
    .eq("profile_id", params.profileId)
    .single();
  const ai = getAiProvider();
  const fitSummary = await ai.fitSummary(
    vector?.redacted_text ?? "",
    `${params.job.title}\n\n${params.job.description}`,
  );

  const { data: reveal, error: revealError } = await admin
    .from("reveal_requests")
    .insert({
      match_id: params.matchId,
      job_posting_id: params.jobPostingId,
      profile_id: params.profileId,
      recruiter_id: params.recruiterId,
      path: params.path,
      status: params.path === "standard" ? "accepted" : "pending",
      fit_summary: fitSummary,
      premium_refund: params.premiumRefund ?? null,
    })
    .select("id")
    .single();
  if (revealError) throw revealError;

  await appendLedger(admin, {
    profileId: params.recruiterId,
    event: params.path === "standard" ? "reveal_spend" : "override_spend",
    amount: -params.cost,
    revealRequestId: reveal.id,
    note:
      params.path === "standard"
        ? `standard reveal (${Math.round(params.score * 100)}% match)`
        : `override reveal (${Math.round(params.score * 100)}% match, ${params.premiumRefund} pts refundable)`,
  });
  await appendLedger(admin, {
    profileId: params.profileId,
    event: "reveal_compensation",
    amount: params.compensation,
    revealRequestId: reveal.id,
    note: params.path === "standard" ? "profile revealed" : "profile override-revealed",
  });

  await admin.from("matches").update({ status: "revealed" }).eq("id", params.matchId);
  await admin.from("message_threads").insert({ reveal_request_id: reveal.id });

  // Cross-party identity disclosure — audit it (migration 0017; owner
  // self-access is deliberately not logged, see src/lib/pii-audit.ts).
  await logPiiAccess(admin, {
    accessorId: params.recruiterId,
    accessorRole: "recruiter",
    subjectId: params.profileId,
    resource: "candidate_identity",
    action: params.path === "standard" ? "standard_reveal" : "override_reveal",
  });

  return reveal.id;
}

/** Standard reveal: candidate has opted in ("interested"). Atomically-ish:
 * debit recruiter -> create reveal -> compensate candidate -> open thread.
 * (True DB-transaction atomicity via a plpgsql function is a fast-follow;
 * acceptable gap at walking-skeleton stage.) */
export async function revealCandidate(matchId: string) {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();

  const { data: match, error } = await admin
    .from("matches")
    .select("id, status, score, profile_id, job_posting_id, job_postings(recruiter_id, title, description)")
    .eq("id", matchId)
    .single();
  if (error) throw new Error("match not found");

  const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
  if (!job || job.recruiter_id !== session.userId) throw new Error("not your job posting");
  if (match.status !== "interested") {
    throw new Error("candidate has not expressed interest yet (override path ships post-MVP)");
  }

  // Match-quality pricing (§4a) + same-role discount (rank 2+ within this job).
  const rank = (await countRevealsForJob(admin, session.userId, match.job_posting_id)) + 1;
  const cost = revealCostForRank(REVEAL_COST, match.score, rank);

  // Cap before balance — deterministic error ordering (revealSpendGuard
  // contract). The daily cap is the DESIGN.md §5 anti-enumeration control;
  // the points cost alone only rate-limits until top-ups ship.
  const [usedToday, balance] = await Promise.all([
    countStandardRevealsToday(admin, session.userId),
    getBalance(admin, session.userId),
  ]);
  const guardError = revealSpendGuard({
    usedToday,
    dailyCap: REVEAL_DAILY_CAP,
    balance,
    cost,
    kind: "reveal",
  });
  if (guardError) throw new Error(guardError);

  await performReveal(admin, {
    matchId: match.id,
    profileId: match.profile_id,
    jobPostingId: match.job_posting_id,
    job,
    recruiterId: session.userId,
    path: "standard",
    cost,
    compensation: REVEAL_COMPENSATION,
    score: match.score,
  });

  revalidatePath(`/recruiter/jobs/${match.job_posting_id}`);
  revalidatePath(`/recruiter/jobs/${match.job_posting_id}/matches`);
}

/** Override reveal: paid pre-opt-in disclosure (DESIGN.md §4). Name + fit
 * summary disclose immediately; the candidate's accept/decline gates
 * messaging only. Guards: surfaced match, candidate's override toggle on,
 * candidate not paused, balance ≥ 25, daily cap, 30-day re-override block. */
export async function overrideRevealCandidate(matchId: string) {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();

  const { data: match, error } = await admin
    .from("matches")
    .select("id, status, score, profile_id, job_posting_id, job_postings(recruiter_id, title, description)")
    .eq("id", matchId)
    .single();
  if (error) throw new Error("match not found");

  const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
  if (!job || job.recruiter_id !== session.userId) throw new Error("not your job posting");
  if (match.status !== "surfaced") {
    throw new Error("override only applies to candidates who haven't responded yet");
  }

  // Match-quality pricing (§4a) + same-role discount (rank 2+ within this job):
  // scale the total cost AND the engagement-premium refund by the same rank +
  // tier factors, so a declined discounted override refunds the right amount.
  // The scaled refund is stored on the reveal_request (below) so both refund
  // paths return exactly what was charged.
  const rank = (await countRevealsForJob(admin, session.userId, match.job_posting_id)) + 1;
  const cost = revealCostForRank(OVERRIDE_COST, match.score, rank);
  const premiumRefund = revealCostForRank(OVERRIDE_PREMIUM_REFUND, match.score, rank);

  const [{ data: candidate }, { data: consent }] = await Promise.all([
    admin.from("profiles").select("visibility").eq("id", match.profile_id).single(),
    admin
      .from("consent_flags")
      .select("reveal_override_enabled")
      .eq("profile_id", match.profile_id)
      .maybeSingle(),
  ]);
  if (!consent?.reveal_override_enabled) {
    throw new Error("this candidate has disabled reveal-override");
  }
  if (candidate?.visibility === "paused") {
    throw new Error("candidate currently unavailable (profile paused)");
  }

  if (await isOverrideBlocked(admin, session.userId, match.profile_id)) {
    throw new Error("this candidate declined a recent override — try again later");
  }
  // Cap before balance — same deterministic ordering as the standard path.
  const [usedToday, balance] = await Promise.all([
    countOverridesToday(admin, session.userId),
    getBalance(admin, session.userId),
  ]);
  const guardError = revealSpendGuard({
    usedToday,
    dailyCap: OVERRIDE_DAILY_CAP,
    balance,
    cost,
    kind: "override",
  });
  if (guardError) throw new Error(guardError);

  await performReveal(admin, {
    matchId: match.id,
    profileId: match.profile_id,
    jobPostingId: match.job_posting_id,
    job,
    recruiterId: session.userId,
    path: "override",
    cost,
    compensation: OVERRIDE_COMPENSATION,
    score: match.score,
    premiumRefund,
  });

  revalidatePath(`/recruiter/jobs/${match.job_posting_id}`);
  revalidatePath(`/recruiter/jobs/${match.job_posting_id}/matches`);
}

export interface BulkRevealOutcome {
  matchId: string;
  outcome: "revealed" | "skipped" | "failed";
  cost?: number;
  reason?: string;
}

interface BulkCandidateRow {
  id: string;
  status: "surfaced" | "interested" | "declined" | "revealed";
  score: number;
  profile_id: string;
  job_posting_id: string;
  job_postings: RevealJobInfo | RevealJobInfo[];
}

/** Loads + validates the shared preconditions for a bulk operation: all
 * matches exist, share one job posting, and that posting belongs to the
 * calling recruiter. Returns matches sorted by score descending (server-side
 * — client-provided order is never trusted) plus the resolved job. */
async function loadBulkCandidates(
  admin: SupabaseClient,
  recruiterId: string,
  matchIds: string[],
): Promise<{ sorted: BulkCandidateRow[]; job: RevealJobInfo; jobPostingId: string }> {
  const { data: matches, error } = await admin
    .from("matches")
    .select(
      "id, status, score, profile_id, job_posting_id, job_postings(recruiter_id, title, description)",
    )
    .in("id", matchIds);
  if (error) throw new Error(`failed to load matches: ${error.message}`);
  if (!matches || matches.length !== matchIds.length) {
    throw new Error("one or more matches not found");
  }

  const jobPostingIds = new Set(matches.map((m) => m.job_posting_id));
  if (jobPostingIds.size > 1) {
    throw new Error("bulk reveal must target candidates for a single job posting");
  }

  const rows = matches as unknown as BulkCandidateRow[];
  const job = Array.isArray(rows[0]!.job_postings) ? rows[0]!.job_postings[0] : rows[0]!.job_postings;
  if (!job || job.recruiter_id !== recruiterId) throw new Error("not your job posting");

  const sorted = [...rows].sort((a, b) => b.score - a.score);
  return { sorted, job, jobPostingId: rows[0]!.job_posting_id };
}

/** Bulk reveal for the Compare view. Processes candidates SEQUENTIALLY (not
 * in parallel): ranks depend on prior successes within the batch, daily caps
 * must be re-checked mid-batch, and balance checks must not race. Continues
 * past individual failures rather than aborting the whole batch. */
export async function bulkRevealCandidates(matchIds: string[]): Promise<BulkRevealOutcome[]> {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  if (matchIds.length === 0) return [];

  const { sorted, job, jobPostingId } = await loadBulkCandidates(admin, session.userId, matchIds);

  let rank = (await countRevealsForJob(admin, session.userId, jobPostingId)) + 1;
  const outcomes: BulkRevealOutcome[] = [];
  let standardCapTripped = false;
  let overrideCapTripped = false;

  for (const match of sorted) {
    if (match.status !== "interested" && match.status !== "surfaced") {
      outcomes.push({
        matchId: match.id,
        outcome: "skipped",
        reason: `match status '${match.status}' is not reveal-eligible`,
      });
      continue;
    }
    const path: "standard" | "override" = match.status === "interested" ? "standard" : "override";

    if (path === "standard" && standardCapTripped) {
      outcomes.push({ matchId: match.id, outcome: "skipped", reason: "daily reveal limit reached" });
      continue;
    }
    if (path === "override" && overrideCapTripped) {
      outcomes.push({ matchId: match.id, outcome: "skipped", reason: "daily override limit reached" });
      continue;
    }

    try {
      if (path === "override") {
        const [{ data: candidate }, { data: consent }] = await Promise.all([
          admin.from("profiles").select("visibility").eq("id", match.profile_id).single(),
          admin
            .from("consent_flags")
            .select("reveal_override_enabled")
            .eq("profile_id", match.profile_id)
            .maybeSingle(),
        ]);
        if (!consent?.reveal_override_enabled) {
          outcomes.push({ matchId: match.id, outcome: "skipped", reason: "candidate has disabled reveal-override" });
          continue;
        }
        if (candidate?.visibility === "paused") {
          outcomes.push({ matchId: match.id, outcome: "skipped", reason: "candidate profile paused" });
          continue;
        }
        if (await isOverrideBlocked(admin, session.userId, match.profile_id)) {
          outcomes.push({ matchId: match.id, outcome: "skipped", reason: "recent override decline — blocked" });
          continue;
        }
      }

      const cost =
        path === "standard"
          ? revealCostForRank(REVEAL_COST, match.score, rank)
          : revealCostForRank(OVERRIDE_COST, match.score, rank);

      const [usedToday, balance] = await Promise.all([
        path === "standard"
          ? countStandardRevealsToday(admin, session.userId)
          : countOverridesToday(admin, session.userId),
        getBalance(admin, session.userId),
      ]);
      const guardError = revealSpendGuard({
        usedToday,
        dailyCap: path === "standard" ? REVEAL_DAILY_CAP : OVERRIDE_DAILY_CAP,
        balance,
        cost,
        kind: path === "standard" ? "reveal" : "override",
      });
      if (guardError) {
        if (guardError.startsWith("daily")) {
          if (path === "standard") standardCapTripped = true;
          else overrideCapTripped = true;
        }
        outcomes.push({ matchId: match.id, outcome: "skipped", reason: guardError });
        continue;
      }

      const premiumRefund =
        path === "override" ? revealCostForRank(OVERRIDE_PREMIUM_REFUND, match.score, rank) : undefined;

      await performReveal(admin, {
        matchId: match.id,
        profileId: match.profile_id,
        jobPostingId: match.job_posting_id,
        job,
        recruiterId: session.userId,
        path,
        cost,
        compensation: path === "standard" ? REVEAL_COMPENSATION : OVERRIDE_COMPENSATION,
        score: match.score,
        premiumRefund,
      });

      outcomes.push({ matchId: match.id, outcome: "revealed", cost });
      rank += 1;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      const message =
        err instanceof Error ? err.message : ((err as { message?: string } | null)?.message ?? String(err));
      if (code === "23505") {
        outcomes.push({ matchId: match.id, outcome: "skipped", reason: "already revealed" });
      } else {
        outcomes.push({ matchId: match.id, outcome: "failed", reason: message });
      }
    }
  }

  revalidatePath(`/recruiter/jobs/${jobPostingId}`);
  revalidatePath(`/recruiter/jobs/${jobPostingId}/matches`);
  return outcomes;
}

export interface BulkRevealPreview {
  matchId: string;
  path?: "standard" | "override";
  cost?: number;
  reason?: string;
}

/** Read-only cost preview for the bulk-reveal confirmation dialog: same
 * ranking/pricing logic as bulkRevealCandidates, no charge, no DB write.
 * Daily-cap/consent/balance checks are NOT run here (those can only be
 * authoritative at commit time) — this shows what each candidate would cost
 * assuming the batch proceeds in score order. */
export async function previewBulkRevealCost(matchIds: string[]): Promise<BulkRevealPreview[]> {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();
  if (matchIds.length === 0) return [];

  const { sorted, jobPostingId } = await loadBulkCandidates(admin, session.userId, matchIds);
  let rank = (await countRevealsForJob(admin, session.userId, jobPostingId)) + 1;

  const previews: BulkRevealPreview[] = [];
  for (const match of sorted) {
    if (match.status === "interested") {
      previews.push({ matchId: match.id, path: "standard", cost: revealCostForRank(REVEAL_COST, match.score, rank) });
      rank += 1;
    } else if (match.status === "surfaced") {
      previews.push({ matchId: match.id, path: "override", cost: revealCostForRank(OVERRIDE_COST, match.score, rank) });
      rank += 1;
    } else {
      previews.push({ matchId: match.id, reason: `match status '${match.status}' is not reveal-eligible` });
    }
  }
  return previews;
}

export async function sendMessage(threadId: string, body: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  if (!body.trim()) return;

  // RLS enforces participant-only + accepted-reveal-only inserts.
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    body: body.trim(),
  });
  if (error) throw new Error(`send failed: ${error.message}`);
  revalidatePath(`/thread/${threadId}`);
}

/** Dev-only: cycle recruiter_tier through free → solo → advanced → pro_saas → free
 * for demoing tier differentiation (BUSINESS.md §7) — no billing integration
 * exists yet. Refuses outside dev so this never ships as a real, unpaid upgrade
 * path. */
export async function toggleRecruiterTier() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-only action");
  }
  const session = await requireRole("recruiter");
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("recruiter_tier")
    .eq("id", session.userId)
    .single();
  if (error) throw new Error(error.message);

  const tierCycle: Record<string, string> = {
    free: "solo",
    solo: "advanced",
    advanced: "pro_saas",
    pro_saas: "free",
  };
  const nextTier = tierCycle[profile.recruiter_tier] ?? "free";
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ recruiter_tier: nextTier })
    .eq("id", session.userId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/recruiter");
}
