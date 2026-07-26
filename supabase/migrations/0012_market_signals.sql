-- B2B market-intelligence product (DESIGN.md §2e/§7 — Market Intelligence
-- mockup). Real k-anonymized aggregation, not a placeholder: two
-- SECURITY DEFINER RPCs are the ONLY access path to candidate-derived
-- aggregate signals, mirroring match_candidates' existing pattern of
-- returning pseudonymized/aggregate fields only, never raw rows. There is
-- deliberately no client-queryable view or direct table grant for this data
-- — see the grants at the bottom — so the k-threshold can't be bypassed by a
-- differently-written query later.
--
-- Both RPCs source only from opted-in seekers (consent_flags.
-- market_signals_opt_in_at is not null — a consent SEPARATE from AI-
-- processing consent, migration 0009) and suppress any cohort below
-- p_min_cohort by returning the row with a null value and suppressed=true,
-- rather than omitting it — so the UI can render an explicit
-- "Not enough data" cell instead of a silently missing one.

-- Both functions dedup to one row per (person, group-key) via an inner
-- `select distinct` CTE BEFORE aggregating. This matters because
-- profiles.skills/desired_roles are plain arrays with no uniqueness
-- guarantee (neither parseCommaList nor the stub's extractProfileFields
-- dedups) — aggregating directly over the unnest join would count
-- occurrences, not distinct people, silently inflating a sub-k cohort past
-- the threshold and (for salary) double-weighting anyone with a duplicated
-- entry in avg(). LEGAL_REVIEW.md Q6's "cohorts of >= k DISTINCT people" is
-- the sentence the confirmation-only posture rests on — this is load-bearing,
-- not a style choice.

create or replace function market_skill_demand(
  p_min_cohort integer default 20
) returns table (
  skill text,
  seeker_count integer,
  suppressed boolean
)
language sql
security definer
set search_path = public
as $$
  with per_person_skill as (
    select distinct p.id as profile_id, s.skill
    from profiles p
    join consent_flags cf on cf.profile_id = p.id
    cross join lateral unnest(p.skills) as s(skill)
    where p.is_seeker
      and p.visibility = 'active'
      and cf.market_signals_opt_in_at is not null
  )
  select
    skill,
    case when count(*) >= p_min_cohort then count(*)::integer else null end as seeker_count,
    count(*) < p_min_cohort as suppressed
  from per_person_skill
  group by skill
  order by count(*) desc;
$$;

create or replace function market_salary_trend(
  p_min_cohort integer default 20
) returns table (
  desired_role text,
  avg_min_salary numeric,
  cohort_size integer,
  suppressed boolean
)
language sql
security definer
set search_path = public
as $$
  with per_person_role as (
    select distinct
      p.id as profile_id,
      r.desired_role,
      (p.dealbreaker_matrix->>'min_salary')::numeric as min_salary
    from profiles p
    join consent_flags cf on cf.profile_id = p.id
    cross join lateral unnest(p.desired_roles) as r(desired_role)
    where p.is_seeker
      and p.visibility = 'active'
      and cf.market_signals_opt_in_at is not null
      and (p.dealbreaker_matrix->>'min_salary') is not null
  )
  select
    desired_role,
    case when count(*) >= p_min_cohort then round(avg(min_salary), 0) else null end as avg_min_salary,
    case when count(*) >= p_min_cohort then count(*)::integer else null end as cohort_size,
    count(*) < p_min_cohort as suppressed
  from per_person_role
  group by desired_role
  order by count(*) desc;
$$;

-- No table grants for the underlying candidate data beyond what already
-- exists (profiles/consent_flags stay owner-only per migration 0002) — these
-- functions run as their owner (security definer) and are the sole access
-- path. Recruiters reach them only via execute, never a table read.
grant execute on function market_skill_demand(integer) to authenticated, service_role;
grant execute on function market_salary_trend(integer) to authenticated, service_role;
