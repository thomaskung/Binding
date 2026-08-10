-- Binding walking-skeleton schema. Mirrors DESIGN.md §2.
-- Full schema up front (including tables with no UI yet) so RLS thinking
-- happens now, not retroactively.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('seeker', 'recruiter', 'enterprise_admin');
create type profile_visibility as enum ('active', 'paused');
create type work_setup as enum ('onsite', 'hybrid', 'remote');
create type job_status as enum ('draft', 'active', 'closed');
create type match_status as enum ('surfaced', 'interested', 'declined', 'revealed');
create type reveal_path as enum ('standard', 'override');
create type reveal_status as enum ('pending', 'accepted', 'declined');
create type points_event as enum (
  'seed',                 -- initial balance grant
  'reveal_spend',         -- recruiter pays for a reveal
  'reveal_compensation',  -- candidate compensated for being revealed
  'override_spend',       -- extra cost for override path (stubbed, no logic yet)
  'partial_refund',       -- refund on declined override (stubbed, no logic yet)
  'verified_action',      -- earning gated on AI-verified quality actions
  'redemption'            -- spending on services (AI rewriting etc.)
);
create type verified_action_type as enum ('skill_assessment', 'work_history');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  display_name text not null default '',
  visibility profile_visibility not null default 'active',
  -- Dealbreaker matrix: {"min_salary": int, "currency": "USD", "equity_required": bool, "work_setups": ["remote", ...]}
  dealbreaker_matrix jsonb,
  -- Seeker profile text lifecycle: edits land in draft_text; an explicit
  -- publish copies it to published_text and re-runs redact -> embed -> match.
  draft_text text,
  published_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table consent_flags (
  profile_id uuid primary key references profiles (id) on delete cascade,
  reveal_override_enabled boolean not null default false,
  contact_sharing_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Resumes & skill vectors
-- ---------------------------------------------------------------------------
create table resumes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  storage_path text,          -- Supabase Storage object path (null for paste-text ingest)
  raw_text text not null,     -- RLS: owner-only. Never selectable by recruiters.
  created_at timestamptz not null default now()
);

create table skill_vectors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  resume_id uuid references resumes (id) on delete set null,
  redacted_text text not null,
  embedding vector(1024) not null, -- Qwen3-Embedding-0.6B output dims
  created_at timestamptz not null default now(),
  unique (profile_id) -- one live vector per profile; republish replaces it
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table job_postings (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text not null,
  status job_status not null default 'draft',
  salary_min integer,
  salary_max integer,
  salary_currency text not null default 'USD',
  work_setups work_setup[] not null default '{}',
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Matches & reveals
-- ---------------------------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references job_postings (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  score real not null,            -- cosine similarity; shown to recruiter only (RLS-safe: column-level hiding done in queries)
  status match_status not null default 'surfaced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_posting_id, profile_id)
);

create table reveal_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  job_posting_id uuid not null references job_postings (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  recruiter_id uuid not null references profiles (id) on delete cascade,
  path reveal_path not null default 'standard',
  status reveal_status not null default 'pending',
  fit_summary text,
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  -- Per-role scoping: one reveal per candidate per job. Revealing the same
  -- candidate for a different job is a new (paid) reveal.
  unique (job_posting_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Points ledger (append-only; balance derived)
-- ---------------------------------------------------------------------------
create table points_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  event points_event not null,
  amount integer not null,        -- positive = credit, negative = debit
  reveal_request_id uuid references reveal_requests (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create view points_balances with (security_invoker = true) as
  select profile_id, coalesce(sum(amount), 0)::integer as balance
  from points_ledger
  group by profile_id;

create table verified_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  action_type verified_action_type not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Messaging (scoped to a reveal) & scheduling (table only, no UI yet)
-- ---------------------------------------------------------------------------
create table message_threads (
  id uuid primary key default gen_random_uuid(),
  reveal_request_id uuid not null unique references reveal_requests (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table interview_schedules (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  proposed_by uuid not null references profiles (id) on delete cascade,
  starts_at timestamptz not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vector indexes
-- ---------------------------------------------------------------------------
create index skill_vectors_embedding_idx on skill_vectors
  using hnsw (embedding vector_cosine_ops);
create index job_postings_embedding_idx on job_postings
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Matching RPC: similarity + dealbreaker filter in one query.
-- SECURITY DEFINER so it can read skill_vectors across profiles, but it only
-- returns pseudonymized fields — never names, raw resumes, or contact info.
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
    and p.role = 'seeker'
    -- Dealbreaker: job salary ceiling must clear candidate minimum
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'min_salary') is null
      or jp.salary_max is null
      or jp.salary_max >= (p.dealbreaker_matrix->>'min_salary')::integer
    )
    -- Dealbreaker: work-setup overlap (candidate accepts at least one of the job's setups)
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

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger job_postings_updated_at before update on job_postings
  for each row execute function set_updated_at();
create trigger matches_updated_at before update on matches
  for each row execute function set_updated_at();
