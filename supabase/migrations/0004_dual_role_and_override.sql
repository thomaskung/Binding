-- Dual-role accounts + override-flow support.
-- One account can hold seeker and/or recruiter roles, both opt-in
-- (registration decision, 2026-07-17 — see DESIGN.md §2a / MEMORY.md).

-- ---------------------------------------------------------------------------
-- profiles: role enum -> independent role flags + recruiter company identity
-- ---------------------------------------------------------------------------
alter table profiles
  add column is_seeker boolean not null default false,
  add column is_recruiter boolean not null default false,
  add column company_name text;

update profiles set is_seeker = true where role = 'seeker';
update profiles set is_recruiter = true where role in ('recruiter', 'enterprise_admin');

alter table profiles drop column role;
drop type user_role;

-- ---------------------------------------------------------------------------
-- consent capture (PDPA/PDPO — DESIGN.md §5): ToS for everyone, explicit
-- AI-redaction/processing consent for seekers. Versioned so future ToS
-- revisions can trigger re-consent.
-- ---------------------------------------------------------------------------
alter table consent_flags
  add column tos_accepted_at timestamptz,
  add column processing_consent_at timestamptz,
  add column consent_version text;

-- ---------------------------------------------------------------------------
-- reveal_requests: accept/decline/expiry timestamp anchors the 30-day
-- re-override block window.
-- ---------------------------------------------------------------------------
alter table reveal_requests
  add column responded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Matching RPCs: role flag instead of enum + self-match exclusion (a
-- dual-role recruiter never sees their own seeker profile on their jobs).
-- ---------------------------------------------------------------------------
create or replace function match_candidates(
  p_job_id uuid,
  p_threshold real default 0.55,
  p_top_n integer default 20
) returns table (
  profile_id uuid,
  score real,
  redacted_text text
)
language sql
security definer
set search_path = public
as $$
  select
    sv.profile_id,
    (1 - (sv.embedding <=> jp.embedding))::real as score,
    sv.redacted_text
  from job_postings jp
  join skill_vectors sv on true
  join profiles p on p.id = sv.profile_id
  where jp.id = p_job_id
    and jp.embedding is not null
    and p.visibility = 'active'
    and p.is_seeker
    and sv.profile_id <> jp.recruiter_id
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'min_salary') is null
      or jp.salary_max is null
      or jp.salary_max >= (p.dealbreaker_matrix->>'min_salary')::integer
    )
    and (
      p.dealbreaker_matrix is null
      or p.dealbreaker_matrix->'work_setups' is null
      or jsonb_array_length(p.dealbreaker_matrix->'work_setups') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(p.dealbreaker_matrix->'work_setups') cand(setup)
        where cand.setup = any(jp.work_setups::text[])
      )
    )
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'equity_required') is null
      or (p.dealbreaker_matrix->>'equity_required')::boolean = false
      or jp.offers_equity = true
    )
    and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
  order by sv.embedding <=> jp.embedding
  limit p_top_n;
$$;

create or replace function match_jobs_for_candidate(
  p_profile_id uuid,
  p_threshold real default 0.55,
  p_top_n integer default 20
) returns table (
  job_posting_id uuid,
  score real
)
language sql
security definer
set search_path = public
as $$
  select
    jp.id as job_posting_id,
    (1 - (sv.embedding <=> jp.embedding))::real as score
  from skill_vectors sv
  join profiles p on p.id = sv.profile_id
  join job_postings jp on jp.status = 'active' and jp.embedding is not null
  where sv.profile_id = p_profile_id
    and p.visibility = 'active'
    and p.is_seeker
    and jp.recruiter_id <> p_profile_id
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'min_salary') is null
      or jp.salary_max is null
      or jp.salary_max >= (p.dealbreaker_matrix->>'min_salary')::integer
    )
    and (
      p.dealbreaker_matrix is null
      or p.dealbreaker_matrix->'work_setups' is null
      or jsonb_array_length(p.dealbreaker_matrix->'work_setups') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(p.dealbreaker_matrix->'work_setups') cand(setup)
        where cand.setup = any(jp.work_setups::text[])
      )
    )
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'equity_required') is null
      or (p.dealbreaker_matrix->>'equity_required')::boolean = false
      or jp.offers_equity = true
    )
    and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
  order by sv.embedding <=> jp.embedding
  limit p_top_n;
$$;

-- ---------------------------------------------------------------------------
-- Reveal disclosure semantics: identity discloses at reveal creation (the
-- override purchase IS the disclosure; accept/decline gates messaging only) —
-- so the recruiter may read the revealed profile row regardless of status.
-- ---------------------------------------------------------------------------
drop policy profiles_revealed_select on profiles;
create policy profiles_revealed_select on profiles
  for select using (
    exists (
      select 1 from reveal_requests rr
      where rr.profile_id = profiles.id
        and rr.recruiter_id = auth.uid()
    )
  );

-- Recruiter identity is public to signed-in users by design: candidates must
-- always be able to see who is contacting them (company on job cards and
-- thread headers) — a trust requirement, not a leak.
create policy profiles_recruiter_identity_select on profiles
  for select using (is_recruiter);

grant execute on all functions in schema public to authenticated, service_role;
