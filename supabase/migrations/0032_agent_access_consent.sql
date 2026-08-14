-- Independently-versioned consent for personal-agent/MCP access (DESIGN.md
-- §14e, Phase 11) — same shape as `connected_accounts_opt_in_at`
-- (migration 0027): optional, independently revocable, cleared entirely on
-- withdrawal (src/lib/consent.ts CONSENT_REGISTRY "connected_accounts"
-- entry's pattern, mirrored for "agent_access").
alter table consent_flags
  add column agent_access_opt_in_at timestamptz,
  add column agent_access_consent_version text;
