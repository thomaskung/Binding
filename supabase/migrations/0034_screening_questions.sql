-- AI-generated screening questions per job posting (DESIGN.md §14c, Phase 13).
-- Mirrors §14b/Phase 12's required-filter/weighted-advantage pattern exactly,
-- but the review-before-publish unit is the WHOLE per-job question set (one
-- `screening_status` column gating all of `screening_questions` at once) —
-- there is no separate table of assessments to publish individually, since
-- these questions are per-job, not a shared cross-job bank like
-- skill_assessments.

alter table job_postings add column screening_enabled boolean not null default false;

-- Array of { "id": uuid, "question": text, "rubric": text }. `rubric` is
-- grading-only, same posture as skill_assessments.rubric — never selected in
-- any seeker-facing query (src/app/(app)/seeker/screening-actions.ts only
-- ever returns question text). Kept as a jsonb array on job_postings rather
-- than a child table: unlike skill assessments, these aren't a shared bank
-- reused across postings, so there's no cross-job foreign-key relationship
-- to normalize.
alter table job_postings add column screening_questions jsonb not null default '[]'::jsonb;

-- Sibling status column (not a value packed inside screening_questions) —
-- keeps the publish-gate query a plain column filter, same architectural
-- choice as skill_assessments.status. Draft: recruiter is still
-- generating/editing the batch, invisible to candidates. Published: the
-- whole current screening_questions array becomes candidate-visible at once.
alter table job_postings add column screening_status text not null default 'draft'
  check (screening_status in ('draft', 'published'));

-- Per-question required/weighted preference: { "<question_id>": "required" | "weighted" }.
-- Same privacy posture as verified_skill_prefs (0033) — recruiter-only in
-- practice via app-layer discipline (never selected in seeker-facing
-- queries), not RLS (a matched seeker's RLS grant covers the whole
-- job_postings row). Settable only once screening_status = 'published'
-- (enforced in src/app/(app)/recruiter/screening-actions.ts) — a draft
-- question set has no grading power yet, mirroring
-- publishedAssessmentSkills' gating in the job-editor UI.
alter table job_postings add column screening_prefs jsonb not null default '{}'::jsonb;

-- One row per ATTEMPT, insert-only — same shape as assessment_attempts, and
-- for the same reason: SCREENING_ANSWER_DAILY_CAP (src/lib/screening-questions.ts)
-- counts rows to bound real gradeAssessmentAttempt (Modal) calls, which only
-- works if every submission is its own row. An earlier draft of this table
-- upserted on (job, profile, question) instead — that silently broke the cap
-- (re-answering the same question forever updates one row, so the count
-- never grows no matter how many real grading calls are made) and is not
-- used. No anti-farming near-duplicate-answer detection on top of this
-- (unlike assessment_attempts' is_duplicate_answer) — not specified in §14c,
-- a deliberate, named scope difference, not an oversight. "Best attempt
-- passes" semantics (a later fail doesn't erase an earlier pass) are
-- computed by the caller the same way skill-assessment's listAvailableAssessments
-- already does, not enforced here.
create table candidate_screening_answers (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references job_postings (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  question_id uuid not null,
  answer_text text not null,
  passed boolean not null,
  rationale text,
  created_at timestamptz not null default now()
);

create index candidate_screening_answers_job_idx on candidate_screening_answers (job_posting_id);
create index candidate_screening_answers_profile_idx on candidate_screening_answers (profile_id);
alter table candidate_screening_answers enable row level security;
grant select, insert, update, delete on candidate_screening_answers to service_role;

-- candidate_score_bonus() v2: extends the Phase-12 function to also sum a
-- capped bonus from passed, PUBLISHED, "weighted" screening-question
-- answers — same 0.10 combined cap as before (both bonus sources share one
-- ceiling, not 0.10 each). CREATE OR REPLACE only — no signature/return-type
-- change, so no DROP FUNCTION needed, and match_candidates/
-- match_jobs_for_candidate don't need re-creating just to pick this up
-- (they already call this function as an opaque scalar).
--
-- Restructured from v1's single bare aggregate over one `cross join lateral`
-- into two independently-`coalesce`d scalar subqueries, summed, then capped.
-- v1 relied on Postgres's "an aggregate with no GROUP BY always yields
-- exactly one row" guarantee holding even when the underlying join/filter
-- produces zero rows (verified empirically in Phase 12's e2e suite, not just
-- reasoned about) — this form doesn't need that argument at all: each
-- branch's own `coalesce(...,0)` makes a zero-widening join a total
-- non-event by construction, independent of the other branch.
create or replace function candidate_score_bonus(p_profile_id uuid, p_job_id uuid)
returns real
language sql
security definer
set search_path = public
as $$
  select least(
    coalesce((
      select sum(case when prefs.pref = 'weighted' then 0.03 else 0 end)
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
    ), 0)
    +
    coalesce((
      select sum(case when sprefs.pref = 'weighted' then 0.03 else 0 end)
      from job_postings jp
      cross join lateral jsonb_each_text(jp.screening_prefs) as sprefs(question_id, pref)
      where jp.id = p_job_id
        and jp.screening_status = 'published'
        and exists (
          select 1
          from candidate_screening_answers csa
          where csa.job_posting_id = jp.id
            and csa.profile_id = p_profile_id
            and csa.question_id::text = sprefs.question_id
            and csa.passed
        )
    ), 0),
    0.10
  )::real
$$;

-- match_candidates / match_jobs_for_candidate: add the required-screening-
-- question dealbreaker alongside the existing required-verified-skill one
-- (same `not exists` shape, same qualifying CTE, same "raw score qualifies,
-- boosted score re-ranks" architecture from Phase 12 — unchanged here). Body
-- edit only via CREATE OR REPLACE — signature/return columns are identical
-- to migration 0033's, so no DROP FUNCTION is needed this time.
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
      -- Required-screening-question dealbreaker (§14c): every question the
      -- recruiter marked 'required' needs a passed answer, or the candidate
      -- is excluded. Empty screening_prefs (the common case — every job
      -- before this phase and most after) makes jsonb_each_text produce zero
      -- rows, so `not exists (select 1 from ... where false-for-all)` is
      -- trivially true — this clause is a safe no-op for every job that
      -- never touches screening questions at all. The `jp.screening_status =
      -- 'published' and jp.screening_enabled` guard is load-bearing, not
      -- decorative: without it, a recruiter reverting to draft
      -- (unpublishScreeningQuestions) or disabling screening entirely would
      -- keep excluding candidates on a preference the seeker can no longer
      -- even see or answer (listScreeningQuestionsForJob only reads
      -- published+enabled) — a silent, permanent zero-match state with no
      -- UI surface explaining why. Same reasoning as candidate_score_bonus's
      -- own `jp.screening_status = 'published'` guard on its bonus branch.
      and not exists (
        select 1
        from jsonb_each_text(jp.screening_prefs) as sprefs(question_id, pref)
        where sprefs.pref = 'required'
          and jp.screening_status = 'published'
          and jp.screening_enabled
          and not exists (
            select 1
            from candidate_screening_answers csa
            where csa.job_posting_id = jp.id
              and csa.profile_id = sv.profile_id
              and csa.question_id::text = sprefs.question_id
              and csa.passed
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
      -- Same load-bearing screening_status/screening_enabled guard as
      -- match_candidates' identical clause above — see that copy's comment.
      and not exists (
        select 1
        from jsonb_each_text(jp.screening_prefs) as sprefs(question_id, pref)
        where sprefs.pref = 'required'
          and jp.screening_status = 'published'
          and jp.screening_enabled
          and not exists (
            select 1
            from candidate_screening_answers csa
            where csa.job_posting_id = jp.id
              and csa.profile_id = p_profile_id
              and csa.question_id::text = sprefs.question_id
              and csa.passed
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
