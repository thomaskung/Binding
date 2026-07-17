"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertJDTextOnly, getAiProvider } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { refreshMatchesForJob } from "@/lib/matching";
import { appendLedger, getBalance, REVEAL_COMPENSATION, REVEAL_COST } from "@/lib/points";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

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

  const balance = await getBalance(admin, session.userId);
  if (balance < REVEAL_COST) throw new Error(`insufficient points (${balance}/${REVEAL_COST})`);

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
