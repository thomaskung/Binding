-- Google Drive connected-account import (DESIGN.md §14a minimal slice,
-- Phase 4, 2026-08-13). Stores the OAuth tokens for a seeker's standing
-- Drive connection — a DATA-ACCESS grant (list/read files), distinct from
-- Phase 3's Supabase-managed *login* OAuth, which never needed its own
-- token storage since Supabase Auth holds that session.
--
-- `provider` is a plain text column (not an enum) with exactly one value
-- used today ('google_drive'). DESIGN.md §14a names LinkedIn/GitHub as
-- future connections, but per this phase's explicit MVP cut there is no
-- generalized multi-provider abstraction in the application code yet — the
-- column exists so a future migration can widen the check constraint
-- instead of renaming a column every existing row depends on.
--
-- SECURITY: token encryption-at-rest is explicitly OUT of scope this phase
-- (a fast-follow, not silently skipped) — plaintext-in-a-service-role-only
-- table is the interim posture, matching `resumes`/`pii_access_log` today.
-- Revisit alongside DESIGN.md §2g's envelope-encryption work.
create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, provider)
);

create index connected_accounts_profile_idx on connected_accounts (profile_id);

-- Service-role only: RLS enabled with NO policies and no authenticated/anon
-- grant (0002's blanket grants were point-in-time — new tables need explicit
-- grants, see the CLAUDE.md gotcha), so PostgREST clients can never read or
-- write tokens directly. All access goes through server route handlers using
-- the admin (service-role) client, which enforces "only your own row" in
-- application code. Same precedent as pii_access_log (0017), except this
-- table is NOT append-only — tokens get refreshed/rotated and the
-- connection can be revoked/reconnected, so update+delete are granted too
-- (pii_access_log deliberately withholds them).
alter table connected_accounts enable row level security;
grant select, insert, update, delete on connected_accounts to service_role;
