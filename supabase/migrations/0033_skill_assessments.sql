-- Skill assessment, open-ended AI-graded (DESIGN.md §14b, supersedes §13d's
-- MCQ sketch, Phase 12). Founder-reviewed rubric bank: `skill_assessments`
-- rows land `draft` (AI-generated or hand-written) and are never visible to
-- a candidate until a recruiter flips them `published` — mirrors
-- `job_postings.status`'s draft/active shape, a status column on the same
-- table rather than a separate review table.
create table skill_assessments (
  id uuid primary key default gen_random_uuid(),
  skill text not null,
  prompt text not null,      -- open-ended question/prompt shown to the candidate
  rubric text not null,      -- grading rubric — never shown to the candidate, grading-only
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references profiles (id),  -- recruiter who requested generation; null for founder-seeded rows
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one PUBLISHED assessment per skill, so job_postings'
-- verified_skill_prefs can reference a skill name and unambiguously resolve
-- to the one currently-live assessment (candidate_score_bonus and the
-- required-skill dealbreaker below both depend on this being unambiguous).
-- Multiple drafts for the same skill are fine (e.g. a recruiter iterating).
create unique index skill_assessments_skill_published_idx on skill_assessments (skill) where status = 'published';

alter table skill_assessments enable row level security;
grant select, insert, update, delete on skill_assessments to service_role;

-- One row per attempt. `embedding` backs duplicate/near-duplicate-answer
-- detection (DESIGN.md §14b anti-farming floor) — cosine-compared against
-- this candidate's OTHER attempts on the SAME assessment, server-side only,
-- via src/lib/skill-assessment.ts. `rationale` is the AI grader's own
-- explanation — kept for founder spot-audits (§14b's "periodic sampled
-- audits" substitute for per-attempt human review), never surfaced to the
-- candidate or recruiter as product copy.
create table assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references skill_assessments (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  answer_text text not null,
  embedding vector(1024),
  passed boolean not null,
  rationale text,
  created_at timestamptz not null default now()
);

create index assessment_attempts_profile_idx on assessment_attempts (profile_id);
create index assessment_attempts_assessment_idx on assessment_attempts (assessment_id);
alter table assessment_attempts enable row level security;
grant select, insert, update, delete on assessment_attempts to service_role;

-- Anti-farming floor (DESIGN.md §14b): is a candidate's answer a near-
-- duplicate of ANY OTHER prior attempt on the SAME assessment — cross-
-- candidate, server-side only (raw answer text never leaves the server or
-- reaches another candidate; only a boolean comes back). Confirmed
-- acceptable during Phase 12 scoping, same posture as match_candidates
-- already comparing candidate data server-side.
--
-- Takes the ALREADY-INSERTED attempt's own id (not a raw vector) —
-- deliberately: passing a `vector(1024)` value as a PostgREST RPC scalar
-- argument from supabase-js is untested territory in this codebase (every
-- existing vector usage — match_candidates, skill_vectors writes — either
-- computes the comparison entirely in SQL from stored columns or writes a
-- vector into a table column via insert, never passes one as an RPC
-- parameter). Looking the embedding up internally by id, using only a uuid
-- parameter, sidesteps that risk entirely. This means the caller's flow is
-- insert-then-check (src/app/(app)/seeker/skill-assessment-actions.ts):
-- insert the attempt with a placeholder passed/rationale, call this with
-- the new row's id, then update passed/rationale once grading resolves.
-- DUPLICATE_ANSWER_SIMILARITY_THRESHOLD in src/lib/skill-assessment.ts
-- mirrors this default by hand (same discipline as VERIFIED_SKILL_BONUS_CAP)
-- — 0.97 is deliberately near-identical-text-only, not "similar topic":
-- paraphrased-but-genuine answers should score well below this.
create or replace function is_duplicate_answer(
  p_attempt_id uuid,
  p_similarity_threshold real default 0.97
) returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from assessment_attempts self
    join assessment_attempts other
      on other.assessment_id = self.assessment_id
     and other.id <> self.id
     and other.embedding is not null
    where self.id = p_attempt_id
      and self.embedding is not null
      and (1 - (other.embedding <=> self.embedding)) >= p_similarity_threshold
  );
$$;

grant execute on function is_duplicate_answer(uuid, real) to authenticated, service_role;

-- Per-job-posting skill preferences: { "<skill>": "required" | "weighted" }.
-- "required" is a hard dealbreaker (candidate must have a PASSED attempt on
-- the published assessment for that skill, enforced in match_candidates'/
-- match_jobs_for_candidate's WHERE below — deliberately NOT mirrored in
-- src/lib/matching.ts's passesDealbreakers, see that function's doc comment
-- for why). "weighted" feeds a small capped bonus via candidate_score_bonus.
-- Recruiter-only in practice — RLS is row-level on job_postings (a matched
-- seeker can read the whole row), so this column's privacy is an app-layer
-- discipline (never selected in seeker-facing queries), not an RLS one —
-- same posture salary_min/salary_max already have via salaryDisplay().
alter table job_postings add column verified_skill_prefs jsonb not null default '{}'::jsonb;

-- Additive bonus for a (profile, job) pair from PASSED, PUBLISHED
-- "weighted" skills — capped (0.10 total; mirrored in
-- src/lib/matching.ts's VERIFIED_SKILL_BONUS_CAP, kept in sync by hand,
-- same discipline as passesDealbreakers). Deliberately does NOT touch
-- surfacing/ranking on its own — see match_candidates/match_jobs_for_candidate
-- below for how it's actually applied (re-ranks an already-qualified set,
-- never pulls a below-threshold candidate above it). v1 here; Phase 13
-- extends this via CREATE OR REPLACE, no RPC rewrite needed.
create or replace function candidate_score_bonus(p_profile_id uuid, p_job_id uuid)
returns real
language sql
security definer
set search_path = public
as $$
  select least(
    coalesce(sum(case when prefs.pref = 'weighted' then 0.03 else 0 end), 0),
    0.10
  )::real
  from job_postings jp
  cross join lateral jsonb_each_text(jp.verified_skill_prefs) as prefs(skill, pref)
  where jp.id = p_job_id
    and exists (
      select 1
      from skill_assessments sa
      join assessment_attempts aa on aa.assessment_id = sa.id
      where sa.skill = prefs.skill
        and sa.status = 'published'
        and aa.profile_id = p_profile_id
        and aa.passed
    )
$$;

grant execute on function candidate_score_bonus(uuid, uuid) to authenticated, service_role;

-- ── match_candidates: qualify on RAW score (dealbreakers + threshold + top-N
-- unchanged in kind, plus the new required-skill dealbreaker), THEN re-rank
-- that already-qualified set by the boosted score. A bonus can move a
-- candidate up within the qualified set; it can never pull a below-threshold
-- candidate into it — the plan's two clauses ("threshold/top-N stays on raw"
-- + "ranking/persisted score uses boosted") are only both true this way. ──
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
  with qualified as (
    select
      sv.profile_id,
      (1 - (sv.embedding <=> jp.embedding))::real as raw_score,
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
      and (
        p.dealbreaker_matrix is null
        or (p.dealbreaker_matrix->>'equity_required') is null
        or (p.dealbreaker_matrix->>'equity_required')::boolean = false
        or jp.offers_equity = true
      )
      -- Required-verified-skill dealbreaker (§14b): every skill the
      -- recruiter marked 'required' needs a passed attempt on that skill's
      -- currently-published assessment, or the candidate is excluded.
      and not exists (
        select 1
        from jsonb_each_text(jp.verified_skill_prefs) as prefs(skill, pref)
        where prefs.pref = 'required'
          and not exists (
            select 1
            from skill_assessments sa
            join assessment_attempts aa on aa.assessment_id = sa.id
            where sa.skill = prefs.skill
              and sa.status = 'published'
              and aa.profile_id = sv.profile_id
              and aa.passed
          )
      )
      and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
    order by sv.embedding <=> jp.embedding
    limit p_top_n
  )
  select
    q.profile_id,
    least(q.raw_score + bonus.bonus, 1.0)::real as score,
    q.redacted_text,
    q.seniority_band,
    q.years_experience,
    q.skills,
    q.industries,
    q.desired_roles,
    q.region,
    q.credentials_summary
  from qualified q
  cross join lateral (select candidate_score_bonus(q.profile_id, p_job_id) as bonus) bonus
  order by least(q.raw_score + bonus.bonus, 1.0) desc;
$$;

grant execute on function match_candidates(uuid, real, integer) to authenticated, service_role;

-- ── match_jobs_for_candidate: identical treatment, mirrored. ──
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
  with qualified as (
    select
      jp.id as job_posting_id,
      (1 - (sv.embedding <=> jp.embedding))::real as raw_score
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
      and not exists (
        select 1
        from jsonb_each_text(jp.verified_skill_prefs) as prefs(skill, pref)
        where prefs.pref = 'required'
          and not exists (
            select 1
            from skill_assessments sa
            join assessment_attempts aa on aa.assessment_id = sa.id
            where sa.skill = prefs.skill
              and sa.status = 'published'
              and aa.profile_id = p_profile_id
              and aa.passed
          )
      )
      and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
    order by sv.embedding <=> jp.embedding
    limit p_top_n
  )
  select
    q.job_posting_id,
    least(q.raw_score + bonus.bonus, 1.0)::real as score
  from qualified q
  cross join lateral (select candidate_score_bonus(p_profile_id, q.job_posting_id) as bonus) bonus
  order by least(q.raw_score + bonus.bonus, 1.0) desc;
$$;

grant execute on function match_jobs_for_candidate(uuid, real, integer) to authenticated, service_role;
