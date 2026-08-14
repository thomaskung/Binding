-- Personal-agent MCP, thin read-only slice (DESIGN.md §14e, Phase 11).
--
-- `agent_tokens`: one row per issued bearer token. Hash-only storage (never
-- the raw token) — same posture as `user_data_key_recovery.code_hash`
-- (Phase 10) and the shape Phase 11's own doc note promised. A profile may
-- hold several tokens (e.g. one per agent/assistant); each is independently
-- revocable.
create table agent_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index agent_tokens_profile_idx on agent_tokens (profile_id);
alter table agent_tokens enable row level security;
grant select, insert, update, delete on agent_tokens to service_role;

-- Every MCP call is logged here (tool name + timestamp only — arguments/
-- results are never persisted, keeping this an access ledger, not a data
-- copy). Kept as its own table rather than folded into `pii_access_log`
-- (owner self-access is outside that table's stated charter) or
-- `decrypt_access_log` (Phase 10, a different agency) — this is
-- owner-self-access under AGENT agency specifically, its own category.
-- Doubles as the source for the daily call-cap check (AGENT_CALLS_DAILY_CAP,
-- src/lib/agent-mcp.ts) — counted per profile, not per token, so a seeker
-- can't raise their effective cap by issuing more tokens.
create table agent_access_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  agent_token_id uuid not null references agent_tokens (id) on delete cascade,
  tool text not null,
  accessed_at timestamptz not null default now()
);

create index agent_access_log_profile_idx on agent_access_log (profile_id, accessed_at);
alter table agent_access_log enable row level security;
grant select, insert on agent_access_log to service_role;
