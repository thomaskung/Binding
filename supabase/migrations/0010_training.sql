-- Training / reskilling home (DESIGN.md §7a). Three distinct funding models
-- share one catalog table:
--   - Personal, free-tier: earn credits by completing a program, spend
--     credits to start another (training_credits_ledger, owner-only, mirrors
--     points_ledger's append-only shape).
--   - Personal, Pro subscriber: cost is waived at start-time (a seeker_tier
--     check in the app layer, not a bigger balance) — no schema needed for
--     this, it's a runtime branch in src/lib/training.ts.
--   - Enterprise: a pure assignment/license model, zero credits involved
--     (enterprise_training_assignments).
--
-- Credit-bootstrap gap, deliberately unresolved (see plan/DESIGN.md §11):
-- free users earn credits by completing programs but need credits to start
-- one — founder intends to revisit the credit system later. Nothing here
-- papers over that; the ledger just records whatever earn/spend events the
-- app layer produces.

create type training_track as enum ('career_path', 'compliance');
create type training_program_type as enum ('guided', 'ai_quiz');
create type training_credit_event as enum ('earned', 'spent');

create table training_programs (
  id uuid primary key default gen_random_uuid(),
  track training_track not null,
  type training_program_type not null,
  title text not null,
  description text not null,
  module_count integer not null default 1,
  credit_cost integer not null default 0,
  created_at timestamptz not null default now()
);

-- Append-only, free-tier-only personal ledger — same shape and posture as
-- points_ledger. No "source"/enterprise column: enterprise assignments never
-- touch this table at all.
create table training_credits_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  event training_credit_event not null,
  amount integer not null, -- positive = earned, negative = spent
  program_id uuid references training_programs (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create view training_credit_balances with (security_invoker = true) as
  select profile_id, coalesce(sum(amount), 0)::integer as balance
  from training_credits_ledger
  group by profile_id;

-- Gates re-completion (no re-earning by replaying the same program) and is
-- the event that feeds Benefits' points-earn trigger.
create table training_completions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  program_id uuid not null references training_programs (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (profile_id, program_id)
);

-- Enterprise license/assignment model: a recruiter (standing in for "their
-- org" — no separate orgs table exists in this schema, same precedent as
-- migration 0008's "no team/multi-seat concept" note) assigns a program to a
-- candidate profile. No credits touch this path at all.
create table enterprise_training_assignments (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references profiles (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  program_id uuid not null references training_programs (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (recruiter_id, profile_id, program_id)
);

alter table training_programs enable row level security;
alter table training_credits_ledger enable row level security;
alter table training_completions enable row level security;
alter table enterprise_training_assignments enable row level security;

-- Catalog: all-authenticated read, no client writes (seeded/managed server-side).
create policy training_programs_select on training_programs
  for select using (true);

-- Personal ledger/completions: owner-only read. Writes go through the admin
-- client only (appendTrainingLedger-equivalent, mirrors points.ts).
create policy training_credits_own_select on training_credits_ledger
  for select using (profile_id = auth.uid());
create policy training_completions_own_select on training_completions
  for select using (profile_id = auth.uid());

-- Assignment: both the assigned employee and the assigning recruiter read
-- their own rows directly off this table's own columns — not cross-table
-- (unlike is_job_owner/seeker_has_match, which check a DIFFERENT table from
-- within another table's policy), so no security-definer helper is needed
-- here; this is the same direct-column shape as reveal_requests'
-- reveals_participant_select policy.
create policy assignments_participant_select on enterprise_training_assignments
  for select using (profile_id = auth.uid() or recruiter_id = auth.uid());
create policy assignments_recruiter_insert on enterprise_training_assignments
  for insert with check (recruiter_id = auth.uid());

grant select on training_programs to authenticated;
grant select, insert, update, delete on training_programs to service_role;
grant select on training_credits_ledger, training_completions to authenticated;
grant select, insert, update, delete on training_credits_ledger, training_completions to service_role;
grant select, insert on enterprise_training_assignments to authenticated;
grant select, insert, update, delete on enterprise_training_assignments to service_role;
grant select on training_credit_balances to authenticated, service_role;

-- Static catalog seed (real product content, not per-environment test data —
-- same posture as the enums above). Placeholder credit costs matching the
-- reviewed Training Home mockup's own demo numbers.
insert into training_programs (track, type, title, description, module_count, credit_cost) values
  ('career_path', 'guided', 'Path to Staff Backend Engineer', 'A guided curriculum toward staff-level backend scope: distributed systems, on-call ownership, technical leadership.', 6, 40),
  ('career_path', 'ai_quiz', 'System Design Fundamentals', 'AI-driven quiz and spaced review covering core distributed-systems design patterns.', 4, 20),
  ('career_path', 'guided', 'Data Engineering Bridge', 'For backend engineers moving into data platform roles: pipelines, warehousing, orchestration.', 5, 30),
  ('compliance', 'guided', 'AML Fundamentals', 'Anti-money-laundering awareness for APAC fintech roles.', 3, 15),
  ('compliance', 'guided', 'Security Awareness', 'Baseline security hygiene: phishing, credential handling, incident reporting.', 2, 15);
