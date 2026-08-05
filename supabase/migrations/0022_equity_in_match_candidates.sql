-- Migration 0018 widened match_candidates to return non-identifying strength
-- fields (seniority_band, years_experience, skills, industries, desired_roles,
-- region, credentials_summary) but inadvertently omitted the equity dealbreaker
-- clause that had been added to the 0001/0004 versions. The clause exists in
-- match_jobs_for_candidate (0004) but not in match_candidates (0018).

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
