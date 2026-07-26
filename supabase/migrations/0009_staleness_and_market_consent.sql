-- Adaptive dashboard staleness signal + separate market-signals opt-in
-- consent (DESIGN.md §2d/§2e). Two independent, unrelated concerns bundled
-- in one migration because both are small column additions.

-- ---------------------------------------------------------------------------
-- Staleness: last time the seeker touched their profile content (publish or
-- work-history edit). Dashboard frame C ("stale") compares this against a
-- fixed window (src/lib/profile.ts isStale()). Backfilled from updated_at so
-- existing profiles don't all read as freshly-updated on day one.
-- ---------------------------------------------------------------------------
alter table profiles
  add column last_profile_activity_at timestamptz;

update profiles set last_profile_activity_at = updated_at;

-- ---------------------------------------------------------------------------
-- Market-signals opt-in: a SEPARATE consent from processing_consent_at
-- (DESIGN.md §2e — participation in the aggregate market-intelligence
-- product is opt-in and revocable independent of AI-processing consent).
-- ---------------------------------------------------------------------------
alter table consent_flags
  add column market_signals_opt_in_at timestamptz,
  add column market_signals_consent_version text;
