-- Referral / invite acquisition loop (DESIGN.md §13g, added 2026-08-14).
-- Audit finding this closes: earn-loops exist (seed, reveal-compensation,
-- freshness, training) but there was no acquisition/viral loop anywhere —
-- the biggest structural hole in the BUSINESS §6a flywheel (seeker→pool→
-- recruiter). Design: both parties earn points ONLY on the invitee's
-- *activation* (never on sending/clicking a link) — anti-farming, closed-
-- loop (points, never cash), same discipline as every other earn mechanic
-- in points.ts.
--
-- profiles.invite_code: a short, unique, lazily-generated code per profile
-- (src/lib/referrals.ts getOrCreateInviteCode — generated on first read of
-- /invite, not eagerly for every profile). `text unique` rather than a
-- fixed-length type: the generation scheme (base36 of random bytes) is an
-- application-code concern, not a schema one.
alter table profiles
  add column invite_code text unique;

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles (id) on delete cascade,
  -- Null until the referred person actually signs up (see `status` below) —
  -- this repo's concrete flow only ever inserts a row once a referee is
  -- known (see src/app/onboarding/actions.ts captureAndEarnReferral), so in
  -- practice referee_id is set at insert time. The column stays nullable to
  -- match the table's conceptual shape from DESIGN.md §13g and to leave room
  -- for a future "invite sent, not yet clicked" row if an email-invite
  -- mechanic is ever added.
  referee_id uuid references profiles (id) on delete cascade,
  invite_code text not null,
  -- text + check constraint rather than a new Postgres enum: 0026's
  -- connected_accounts precedent states the house preference for this
  -- (a `check` widens with a plain migration; an enum requires
  -- ALTER TYPE ... ADD VALUE, which can't run inside the same transaction
  -- as other DDL on some PG versions).
  --
  -- 'pending' is RESERVED, NOT POPULATED by this phase's code: nothing here
  -- creates a referral row before a referee is known (no email-invite send
  -- mechanic exists yet — this is a copy-a-link loop), so every row this
  -- phase writes starts at 'signed_up'. Kept in the check constraint for
  -- forward-compat with a future "invite sent" tracking feature, and so the
  -- three-state lifecycle DESIGN.md §13g describes is representable even
  -- though only two of the three states are reachable today.
  status text not null default 'pending' check (status in ('pending', 'signed_up', 'activated')),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- Lookup by invite_code (redeem-landing route resolving referrer) and by
-- referee_id (activation-time "does this user already have a referral
-- row" check). referrer_id also indexed — the /invite dashboard lists all
-- of the viewer's own referrals.
create index referrals_invite_code_idx on referrals (invite_code);
create index referrals_referrer_idx on referrals (referrer_id);
-- Partial unique index (not a bare column-level unique): referee_id is
-- nullable, and a plain `unique` constraint in Postgres allows unlimited
-- NULLs anyway, but being explicit that the invariant is "a real referee
-- appears in at most one referral row" (not "referee_id is unique") reads
-- clearer than relying on NULL semantics implicitly. Also enforces, at the
-- DB layer, the anti-double-referral invariant the application code checks
-- before inserting.
create unique index referrals_referee_unique_idx on referrals (referee_id) where referee_id is not null;

-- Service-role only: RLS enabled with NO authenticated/anon policies, same
-- precedent as pii_access_log (0017) / connected_accounts (0026) — new
-- tables need explicit grants (0002's blanket grant was point-in-time).
-- Update is granted (not append-only like pii_access_log) because a
-- referral's status/activated_at are mutated in place as it progresses.
alter table referrals enable row level security;
grant select, insert, update on referrals to service_role;
