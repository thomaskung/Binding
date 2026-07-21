-- Recruiter/seeker profile pages (recruiter-profile + seeker-profile
-- claude.ai/design templates). "Team members" card was omitted — no
-- team/multi-seat concept exists anywhere in the schema or strategy docs,
-- just pricing-tier language ("10 seats"), so building it would be inventing
-- a feature, not porting one.

create type company_size as enum ('startup', 'mid', 'large', 'enterprise');

alter table profiles
  -- Seeker fields.
  add column headline text,
  add column phone text,
  -- Full address, internal (self) view only — external/recruiter-facing
  -- preview derives a region-only display from this (see src/lib/profile.ts).
  add column location text,
  add column skills text[] not null default '{}',
  add column desired_roles text[] not null default '{}',
  add column industries text[] not null default '{}',
  add column references_available boolean not null default false,
  -- Gates whether the (candidate-facing) external view shows the salary
  -- range at all — off means recruiters see the role only, not the number.
  add column share_salary boolean not null default true,
  -- Recruiter fields.
  add column recruiter_title text,
  add column company_industry text,
  add column company_size company_size;

-- Structured work history — deliberately owner-only (see RLS below), same
-- privacy posture as `resumes`/`skill_vectors`. Recruiters never get direct
-- access to raw entries; only the derived, aggregated facts computed from
-- them (years of experience, tenure/stability, dominant industry) reach the
-- match embedding — see src/lib/experience.ts and publishProfile().
create table seeker_experience (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  role text not null,
  company text not null,
  industry text,
  start_date date not null,
  end_date date, -- null = present / ongoing
  created_at timestamptz not null default now()
);

alter table seeker_experience enable row level security;

create policy seeker_experience_own_all on seeker_experience
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on seeker_experience to authenticated, service_role;
