-- 0023: enforce salary_min/salary_max NOT NULL (close DESIGN §4a open question).
-- The columns are nullable today (0001), the editor only counts both bounds as
-- one complete field, and saveJob writes null for empty form fields — so a
-- half-filled salary range is creatable. DESIGN §4a derives a seniority pricing
-- tier from the salary band and treats salary as mandatory at posting time;
-- that derivation is unsound while the columns are nullable.
--
-- Backfill, tighten, then drop the now-unreachable `salary_max is null` branch
-- from both match RPCs (mirrors the dealbreaker semantics exactly otherwise).

-- ── Backfill existing half-filled / empty rows ──────────────────────────────
-- If only one bound is set, mirror it into the other (the seed data always
-- supplies both, so this is a defensive no-op in practice). Both-null rows get
-- a sentinel of 0 — clearly invalid for a real posting, but it lets the NOT
-- NULL constraint land without inventing plausible salary data.
update job_postings set salary_min = salary_max where salary_min is null and salary_max is not null;
update job_postings set salary_max = salary_min where salary_max is null and salary_min is not null;
update job_postings set salary_min = 0, salary_max = 0 where salary_min is null and salary_max is null;

-- ── Tighten the columns ────────────────────────────────────────────────────
alter table job_postings alter column salary_min set not null;
alter table job_postings alter column salary_max set not null;

-- ── match_candidates: drop the dead `salary_max is null` branch ────────────
-- Identical to 0022's body except line for the removed `or jp.salary_max is
-- null` clause — the column is now NOT NULL, so the OR branch can never fire.
drop function if exists match_candidates(uuid, real, integer);

create or replace function match_candidates(
  p_job_id uuid,
  p_threshold real default 0.55,
  p_top_n integer default 20
) returns table (
  profile_id uuid,
  score real,
  redacted_text text,
  seniority_band text,
  years_experience integer,
  skills text[],
  industries text[],
  desired_roles text[],
  region text,
  credentials_summary text
)
language sql
security definer
set search_path = public
as $$
  select
    sv.profile_id,
    (1 - (sv.embedding <=> jp.embedding))::real as score,
    sv.redacted_text,
    p.seniority_band,
    p.years_experience,
    p.skills,
    p.industries,
    p.desired_roles,
    region_from_location(p.location) as region,
    case
      when (p.field_visibility->>'credentials') = 'hidden' then null
      else p.credentials_summary
    end as credentials_summary
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
    -- Equity dealbreaker: candidate requires equity → job must offer it
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

grant execute on function match_candidates(uuid, real, integer) to authenticated, service_role;

-- ── match_jobs_for_candidate: drop the same dead branch ────────────────────
-- Identical to 0004's body except for the removed `or jp.salary_max is null`.
drop function if exists match_jobs_for_candidate(uuid, real, integer);

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

grant execute on function match_jobs_for_candidate(uuid, real, integer) to authenticated, service_role;
