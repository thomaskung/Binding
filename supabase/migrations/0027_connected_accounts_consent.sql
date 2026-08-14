-- Connected-accounts (Google Drive) consent (DESIGN.md §14a, Phase 4,
-- 2026-08-13) — a FOURTH independent consent alongside CONSENT_VERSION /
-- MARKET_SIGNALS_CONSENT_VERSION / MAINTENANCE_CONSENT_VERSION
-- (src/lib/consent.ts). Same shape as the market-signals opt-in (0009):
-- granting or withdrawing this must never imply consent to/from any of the
-- other three.
--
-- Required before a seeker can start the Drive OAuth flow (checked in the
-- /api/connected-accounts/google-drive/authorize route, not by a DB
-- constraint here) — this is a genuinely new, non-essential input method
-- (an alternative to pasting text or uploading a PDF), not part of the core
-- "processing consent" service, so it stays optional like market-signals
-- and maintenance consent rather than folded into the required set.
alter table consent_flags
  add column connected_accounts_opt_in_at timestamptz,
  add column connected_accounts_consent_version text;
