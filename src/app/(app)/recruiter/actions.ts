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
  countStandardRevealsToday,
  getBalance,
  isOverrideBlocked,
  OVERRIDE_COMPENSATION,
  OVERRIDE_COST,
  OVERRIDE_DAILY_CAP,
  REVEAL_COMPENSATION,
  REVEAL_COST,
  REVEAL_DAILY_CAP,
  revealSpendGuard,
} from "@/lib/points";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

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
    skills: parseCommaList(String(formData.get("skills") ?? "")),
    responsibilities: parseLineList(String(formData.get("responsibilities") ?? "")),
    requirements: parseLineList(String(formData.get("requirements") ?? "")),
  };
  if (!values.title || !values.description) throw new Error("title and description required");

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

/** Standard reveal: candidate has opted in ("interested"). Atomically-ish:
 * debit recruiter -> create reveal -> compensate candidate -> open thread.
 * (True DB-transaction atomicity via a plpgsql function is a fast-follow;
 * acceptable gap at walking-skeleton stage.) */
export async function revealCandidate(matchId: string) {
  const session = await requireRole("recruiter");
  const admin = createSupabaseAdminClient();

  const { data: match, error } = await admin
    .from("matches")
    .select("id, status, profile_id, job_posting_id, job_postings(recruiter_id, title, description)")
    .eq("id", matchId)
    .single();
  if (error) throw new Error("match not found");

  const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
  if (!job || job.recruiter_id !== session.userId) throw new Error("not your job posting");
  if (match.status !== "interested") {
    throw new Error("candidate has not expressed interest yet (override path ships post-MVP)");
  }

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
    cost: REVEAL_COST,
    kind: "reveal",
  });
  if (guardError) throw new Error(guardError);

  // Fit summary from redacted text + JD — private AI path only.
  const { data: vector } = await admin
    .from("skill_vectors")
    .select("redacted_text")
    .eq("profile_id", match.profile_id)
    .single();
  const ai = getAiProvider();
  const fitSummary = await ai.fitSummary(
    vector?.redacted_text ?? "",
    `${job.title}\n\n${job.description}`,
  );

  const { data: reveal, error: revealError } = await admin
    .from("reveal_requests")
    .insert({
      match_id: match.id,
      job_posting_id: match.job_posting_id,
      profile_id: match.profile_id,
      recruiter_id: session.userId,
      path: "standard",
      status: "accepted", // standard path = candidate already opted in
      fit_summary: fitSummary,
    })
    .select("id")
    .single();
  if (revealError) throw new Error(`reveal failed: ${revealError.message}`);

  await appendLedger(admin, {
    profileId: session.userId,
    event: "reveal_spend",
    amount: -REVEAL_COST,
    revealRequestId: reveal.id,
    note: "standard reveal",
  });
  await appendLedger(admin, {
    profileId: match.profile_id,
    event: "reveal_compensation",
    amount: REVEAL_COMPENSATION,
    revealRequestId: reveal.id,
    note: "profile revealed",
  });

  await admin.from("matches").update({ status: "revealed" }).eq("id", match.id);
  await admin.from("message_threads").insert({ reveal_request_id: reveal.id });

  // Cross-party identity disclosure — audit it (migration 0017; owner
  // self-access is deliberately not logged, see src/lib/pii-audit.ts).
  await logPiiAccess(admin, {
    accessorId: session.userId,
    accessorRole: "recruiter",
    subjectId: match.profile_id,
    resource: "candidate_identity",
    action: "standard_reveal",
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
    .select("id, status, profile_id, job_posting_id, job_postings(recruiter_id, title, description)")
    .eq("id", matchId)
    .single();
  if (error) throw new Error("match not found");

  const job = Array.isArray(match.job_postings) ? match.job_postings[0] : match.job_postings;
  if (!job || job.recruiter_id !== session.userId) throw new Error("not your job posting");
  if (match.status !== "surfaced") {
    throw new Error("override only applies to candidates who haven't responded yet");
  }

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
    cost: OVERRIDE_COST,
    kind: "override",
  });
  if (guardError) throw new Error(guardError);

  const { data: vector } = await admin
    .from("skill_vectors")
    .select("redacted_text")
    .eq("profile_id", match.profile_id)
    .single();
  const ai = getAiProvider();
  const fitSummary = await ai.fitSummary(
    vector?.redacted_text ?? "",
    `${job.title}\n\n${job.description}`,
  );

  const { data: reveal, error: revealError } = await admin
    .from("reveal_requests")
    .insert({
      match_id: match.id,
      job_posting_id: match.job_posting_id,
      profile_id: match.profile_id,
      recruiter_id: session.userId,
      path: "override",
      status: "pending", // candidate decides; messaging locked until accepted
      fit_summary: fitSummary,
    })
    .select("id")
    .single();
  if (revealError) throw new Error(`override reveal failed: ${revealError.message}`);

  await appendLedger(admin, {
    profileId: session.userId,
    event: "override_spend",
    amount: -OVERRIDE_COST,
    revealRequestId: reveal.id,
    note: "override reveal (10 base + 15 premium)",
  });
  await appendLedger(admin, {
    profileId: match.profile_id,
    event: "reveal_compensation",
    amount: OVERRIDE_COMPENSATION,
    revealRequestId: reveal.id,
    note: "profile override-revealed",
  });

  await admin.from("matches").update({ status: "revealed" }).eq("id", match.id);
  await admin.from("message_threads").insert({ reveal_request_id: reveal.id });

  // Cross-party identity disclosure (pre-opt-in — the higher-privacy-cost
  // path) — audit it (migration 0017).
  await logPiiAccess(admin, {
    accessorId: session.userId,
    accessorRole: "recruiter",
    subjectId: match.profile_id,
    resource: "candidate_identity",
    action: "override_reveal",
  });

  revalidatePath(`/recruiter/jobs/${match.job_posting_id}`);
  revalidatePath(`/recruiter/jobs/${match.job_posting_id}/matches`);
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

/** Dev-only: flip recruiter_tier between 'free' and 'solo' for demoing tier
 * differentiation (BUSINESS.md §7) — no billing integration exists yet.
 * Refuses outside dev so this never ships as a real, unpaid upgrade path. */
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

  const nextTier = profile.recruiter_tier === "solo" ? "free" : "solo";
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ recruiter_tier: nextTier })
    .eq("id", session.userId);
  if (updateError) throw new Error(updateError.message);
  revalidatePath("/recruiter");
}
