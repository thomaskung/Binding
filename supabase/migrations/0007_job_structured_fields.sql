-- Structured job-posting fields (reconciled across the job-posting,
-- new-job-post, and individual-job-post claude.ai/design templates —
-- all three agree on this exact field set). Matching logic is unaffected:
-- work_setups stays the dealbreaker-matched field; `location` is a
-- free-text display string alongside it. skills/responsibilities/
-- requirements are structured lists split out of what used to be
-- freeform description text, for the new sectioned posting UI.

create type employment_type as enum ('fulltime', 'parttime', 'contract', 'intern');
create type salary_visibility as enum ('public', 'on_request');

alter table job_postings
  add column department text,
  add column location text,
  add column employment_type employment_type not null default 'fulltime',
  add column salary_visibility salary_visibility not null default 'public',
  add column skills text[] not null default '{}',
  add column responsibilities text[] not null default '{}',
  add column requirements text[] not null default '{}';
