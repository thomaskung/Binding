-- Seeker Pro tier (DESIGN.md/BUSINESS.md: "Pro seekers $9.99/mo" — previously
-- named as a strategy concept, not yet backed by schema). First consumer:
-- gating the high-match-quality band shown on the seeker dashboard (see
-- src/lib/matching.ts matchBand()). No billing integration yet — this column
-- is set manually (seed data, or the dev-only toggle on the seeker dashboard)
-- until a real payment flow lands.

alter table profiles
  add column seeker_tier text not null default 'free'
    check (seeker_tier in ('free', 'pro'));
