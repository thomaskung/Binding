-- Market intelligence depth (Phase 3B of the Binding.dc.html
-- implementation): two new breakdown dimensions — skill demand by region,
-- salary trend by seniority band — same k-anonymity posture as
-- 0012_market_signals.sql (per-cell min-cohort suppression, security
-- definer RPCs as the only access path).
--
-- seniority_band is a STORED column, not derived inline in SQL, and that's
-- deliberate: seeker_experience has multiple rows per person, so joining it
-- directly into a group-by would let one person contribute multiple rows to
-- a cohort count, silently inflating a cell above the min-cohort threshold
-- (exactly the leak k-anonymity exists to prevent). Instead publishProfile()
-- computes the band from computeExperienceStats(...).totalYears — the same
-- canonical interval-merge total used everywhere else — and stores it here,
-- so this dimension joins as a plain per-profile scalar, same safety shape
-- as `region` below.
alter table profiles
  add column seniority_band text;

-- Region bucketing: ports regionFromLocation()'s "last two comma-separated,
-- trimmed segments" rule (src/lib/profile.ts) into SQL, so the aggregate
-- breakdown uses the same regionalization the seeker-facing UI already
-- treats as safe to show recruiters (never the full street address).
create or replace function region_from_location(loc text)
returns text
language sql
immutable
as $$
  with parts as (
    select array_agg(trim(p)) filter (where trim(p) <> '') as arr
    from unnest(string_to_array(coalesce(loc, ''), ',')) as p
  )
  select case
    when arr is null or array_length(arr, 1) is null then null
    else array_to_string(arr[greatest(1, array_length(arr, 1) - 1) : array_length(arr, 1)], ', ')
  end
  from parts;
$$;

create or replace function market_skill_demand_by_location(
  p_min_cohort integer default 20
) returns table (
  skill text,
  region text,
  seeker_count integer,
  suppressed boolean
)
language sql
security definer
set search_path = public
as $$
  with per_person_skill_region as (
    select distinct
      p.id as profile_id,
      s.skill,
      region_from_location(p.location) as region
    from profiles p
    join consent_flags cf on cf.profile_id = p.id
    cross join lateral unnest(p.skills) as s(skill)
    where p.is_seeker
      and p.visibility = 'active'
      and cf.market_signals_opt_in_at is not null
      and region_from_location(p.location) is not null
  )
  select
    skill,
    region,
    case when count(*) >= p_min_cohort then count(*)::integer else null end as seeker_count,
    count(*) < p_min_cohort as suppressed
  from per_person_skill_region
  group by skill, region
  order by skill, count(*) desc;
$$;

create or replace function market_salary_trend_by_seniority(
  p_min_cohort integer default 20
) returns table (
  desired_role text,
  seniority_band text,
  avg_min_salary numeric,
  cohort_size integer,
  suppressed boolean
)
language sql
security definer
set search_path = public
as $$
  with per_person_role_band as (
    select distinct
      p.id as profile_id,
      r.desired_role,
      p.seniority_band,
      (p.dealbreaker_matrix->>'min_salary')::numeric as min_salary
    from profiles p
    join consent_flags cf on cf.profile_id = p.id
    cross join lateral unnest(p.desired_roles) as r(desired_role)
    where p.is_seeker
      and p.visibility = 'active'
      and cf.market_signals_opt_in_at is not null
      and (p.dealbreaker_matrix->>'min_salary') is not null
      and p.seniority_band is not null
  )
  select
    desired_role,
    seniority_band,
    case when count(*) >= p_min_cohort then round(avg(min_salary), 0) else null end as avg_min_salary,
    case when count(*) >= p_min_cohort then count(*)::integer else null end as cohort_size,
    count(*) < p_min_cohort as suppressed
  from per_person_role_band
  group by desired_role, seniority_band
  order by desired_role, count(*) desc;
$$;

grant execute on function market_skill_demand_by_location(integer) to authenticated, service_role;
grant execute on function market_salary_trend_by_seniority(integer) to authenticated, service_role;
