-- Recruiter tiers (BUSINESS.md §7: Free / Solo / Advanced / Pro SaaS). Free is
-- the default for all recruiter accounts. No billing integration yet — the
-- column is set via seed data or the dev-only toggle on the recruiter
-- dashboard until a real payment flow lands (mirrors 0006_seeker_tier.sql).

alter table profiles
  add column recruiter_tier text not null default 'free'
    check (recruiter_tier in ('free', 'solo', 'advanced', 'pro_saas'));
