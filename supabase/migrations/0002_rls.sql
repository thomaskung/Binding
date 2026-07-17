-- RLS policies per DESIGN.md §5.
-- Core invariants:
--   * Recruiters can never select raw resumes or unredacted PII.
--   * Seekers see only their own rows.
--   * Match visibility gated by status; candidate never sees the score column
--     via the candidate-facing queries (enforced in app queries; the score is
--     not secret-critical, the identity direction is).
--   * Messages visible to thread participants only.
-- The service-role key bypasses RLS; it is used only in server-side route
-- handlers that enforce their own invariants (matching RPC, reveal flow).

alter table profiles enable row level security;
alter table consent_flags enable row level security;
alter table resumes enable row level security;
alter table skill_vectors enable row level security;
alter table job_postings enable row level security;
alter table matches enable row level security;
alter table reveal_requests enable row level security;
alter table points_ledger enable row level security;
alter table verified_actions enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;
alter table interview_schedules enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: owner full access; no cross-profile reads except via RPC/reveals.
-- ---------------------------------------------------------------------------
create policy profiles_own_select on profiles
  for select using (id = auth.uid());
-- The reveal exception: a recruiter with an accepted reveal may read the
-- candidate's profile row (name disclosure). Contact info isn't stored on
-- profiles, so this discloses exactly what a reveal is supposed to disclose.
-- (No recursion: reveal_requests policies reference only their own columns.)
create policy profiles_revealed_select on profiles
  for select using (
    exists (
      select 1 from reveal_requests rr
      where rr.profile_id = profiles.id
        and rr.recruiter_id = auth.uid()
        and rr.status = 'accepted'
    )
  );
create policy profiles_own_insert on profiles
  for insert with check (id = auth.uid());
create policy profiles_own_update on profiles
  for update using (id = auth.uid());

-- consent_flags: owner-only.
create policy consent_own_all on consent_flags
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- resumes: owner-only. THE core privacy invariant — raw resume text is never
-- readable by any other authenticated user, regardless of reveal state.
create policy resumes_own_all on resumes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- skill_vectors: owner can read their own; cross-profile access happens only
-- through the security-definer match_candidates() RPC which returns
-- pseudonymized fields.
create policy skill_vectors_own_all on skill_vectors
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cross-table policy helpers. job_postings' seeker policy needs matches, and
-- matches' recruiter policy needs job_postings — expressed as inline
-- subqueries that's mutual RLS recursion ("infinite recursion detected").
-- SECURITY DEFINER functions evaluate without re-triggering RLS, breaking
-- the cycle.
-- ---------------------------------------------------------------------------
create or replace function is_job_owner(p_job_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from job_postings where id = p_job_id and recruiter_id = auth.uid()
  );
$$;

create or replace function seeker_has_match(p_job_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from matches where job_posting_id = p_job_id and profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- job_postings: recruiter owns theirs; seekers may read ACTIVE jobs they've
-- been matched with (needed to render "you matched with this role").
-- ---------------------------------------------------------------------------
create policy jobs_recruiter_all on job_postings
  for all using (recruiter_id = auth.uid()) with check (recruiter_id = auth.uid());
create policy jobs_matched_seeker_select on job_postings
  for select using (status = 'active' and seeker_has_match(id));

-- ---------------------------------------------------------------------------
-- matches: both sides of the match may read it; status transitions go through
-- server routes (service role) so neither side can forge a reveal.
-- ---------------------------------------------------------------------------
create policy matches_seeker_select on matches
  for select using (profile_id = auth.uid());
create policy matches_recruiter_select on matches
  for select using (is_job_owner(job_posting_id));
-- Candidate may flag interest/decline on their own match rows.
create policy matches_seeker_update on matches
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and status in ('interested', 'declined'));

-- ---------------------------------------------------------------------------
-- reveal_requests: visible to both parties. Created only via server route
-- (service role) because creation must atomically debit points.
-- ---------------------------------------------------------------------------
create policy reveals_participant_select on reveal_requests
  for select using (profile_id = auth.uid() or recruiter_id = auth.uid());

-- points_ledger: owner-only read; writes only via server routes (service role).
create policy points_own_select on points_ledger
  for select using (profile_id = auth.uid());

-- verified_actions: owner-only.
create policy verified_own_all on verified_actions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- messaging: participants of the underlying reveal only.
-- ---------------------------------------------------------------------------
create policy threads_participant_select on message_threads
  for select using (
    exists (
      select 1 from reveal_requests rr
      where rr.id = message_threads.reveal_request_id
        and (rr.profile_id = auth.uid() or rr.recruiter_id = auth.uid())
    )
  );

create policy messages_participant_select on messages
  for select using (
    exists (
      select 1 from message_threads mt
      join reveal_requests rr on rr.id = mt.reveal_request_id
      where mt.id = messages.thread_id
        and (rr.profile_id = auth.uid() or rr.recruiter_id = auth.uid())
    )
  );
create policy messages_participant_insert on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from message_threads mt
      join reveal_requests rr on rr.id = mt.reveal_request_id
      where mt.id = messages.thread_id
        and rr.status = 'accepted'
        and (rr.profile_id = auth.uid() or rr.recruiter_id = auth.uid())
    )
  );

create policy schedules_participant_select on interview_schedules
  for select using (
    exists (
      select 1 from message_threads mt
      join reveal_requests rr on rr.id = mt.reveal_request_id
      where mt.id = interview_schedules.thread_id
        and (rr.profile_id = auth.uid() or rr.recruiter_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants. RLS gates the rows; these gate the tables. Without them PostgREST
-- returns 42501 regardless of policies.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- anon needs nothing beyond schema usage today (no public unauthenticated reads).
