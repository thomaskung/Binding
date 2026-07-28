-- Append-only PII access audit trail (DESIGN.md §2f Layer-1/Layer-3 controls,
-- decided 2026-07-28). Scope: CROSS-PARTY access only — a recruiter being
-- disclosed a candidate's identity (reveal/override), and the future internal
-- ops panel's break-glass unmask. Owner self-access is deliberately NOT
-- logged (it would drown the accountability signal in routine noise).
--
-- accessor_role/reason are Layer-3-ready: today only 'recruiter' rows are
-- written (reason null); the ops panel will write 'support'/'ta_service'
-- rows with a mandatory break-glass reason.

create type pii_resource_type as enum ('candidate_identity', 'raw_resume', 'contact_info');

create table pii_access_log (
  id uuid primary key default gen_random_uuid(),
  accessor_id uuid not null references profiles (id) on delete cascade,
  accessor_role text not null,
  subject_id uuid not null references profiles (id) on delete cascade,
  resource pii_resource_type not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index pii_access_log_subject_idx on pii_access_log (subject_id, created_at desc);
create index pii_access_log_accessor_idx on pii_access_log (accessor_id, created_at desc);

-- Service-role only: RLS enabled with NO policies and no authenticated
-- grant (0002's blanket grants were point-in-time — new tables get explicit
-- grants, see the gotcha in CLAUDE.md), so PostgREST clients can never read
-- or write rows. The admin client (service role, bypasses RLS) is the only
-- writer. Append-only: update/delete deliberately not granted even to the
-- service role — audit rows are immutable through PostgREST.
alter table pii_access_log enable row level security;
grant select, insert on pii_access_log to service_role;
