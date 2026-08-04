-- 0018: recruiter candidate-card + reveal overhaul (DESIGN §5 / §2f).
-- Adds the strength-card signals, a durable "declared interest" timestamp, and
-- credentials (raw owner-only + a de-identified generalized summary), then
-- widens match_candidates to return the non-identifying strength fields.

-- ── profiles: derived seniority years + credentials ─────────────────────────
alter table profiles
  add column years_experience integer,       -- derived total years, stored at publish (mirrors seniority_band)
  add column credentials text,               -- raw seeker free-text (awards/certs/patents)
  add column credentials_summary text;       -- Modal-generalized, de-identified rollup

comment on column profiles.credentials is
  'Raw seeker-entered credentials (awards/certs/patents). OWNER-ONLY — same posture as draft_text/raw_text; never sent to recruiters or a frontier API.';
comment on column profiles.credentials_summary is
  'De-identified, Modal-generalized rollup of credentials. The ONLY credentials value recruiters see (gated by field_visibility.credentials).';

-- ── matches: durable declared-interest timestamp ────────────────────────────
-- updated_at is clobbered by later status changes, so "sort by most recent
-- interest" needs its own column. Backfill from updated_at for existing
-- interested rows (best available approximation).
alter table matches
  add column interested_at timestamptz;

update matches
  set interested_at = updated_at
  where status = 'interested' and interested_at is null;

-- ── match_candidates: return the non-identifying strength fields ────────────
-- Return type changes, so drop then recreate. Recruiter still gets the raw
-- score; credentials_summary honors the seeker's field_visibility opt-out;
-- region is the coarse region_from_location bucket, never the full location.
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
    and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
  order by sv.embedding <=> jp.embedding
  limit p_top_n;
$$;

grant execute on function match_candidates(uuid, real, integer) to authenticated, service_role;
