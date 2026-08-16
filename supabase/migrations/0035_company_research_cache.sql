-- AI Company Research (DESIGN.md §14k, Phase 14) — a standalone,
-- candidate-facing feature explicitly NOT part of §7's AI-Credit-Marketplace
-- allowance (see AiProvider.researchCompany's own doc comment for why).
--
-- Cached per JOB POSTING, not per company — a deliberate scope choice, not
-- an oversight. `profiles.company_name` is free text (no separate companies
-- table/canonical identity exists in this schema), so deduping across
-- multiple postings from what a human would recognize as "the same company"
-- would need fuzzy identity resolution this phase doesn't build. Caching
-- per posting still fully satisfies the stated goal ("bound repeat-view and
-- repeat-search-API cost" — DESIGN.md §14k) for the actual common case: a
-- seeker revisiting the SAME posting's match page.
--
-- No TTL/expiry column — this is the first cache-shaped table in this
-- schema (confirmed: no existing migration has a keyed-cache + TTL shape to
-- mirror). A company's news/culture can go stale with no refresh path this
-- phase; accepted as a named MVP gap rather than building invalidation
-- logic nothing in the design calls for yet.
create table company_research_cache (
  job_posting_id uuid primary key references job_postings (id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now()
);

alter table company_research_cache enable row level security;
grant select, insert, update, delete on company_research_cache to service_role;

-- One row per REAL cache-miss request (a fresh Brave + Modal spend), not per
-- cache read — a cache hit is free and must not count against
-- COMPANY_RESEARCH_DAILY_CAP (src/lib/company-research.ts). Kept as a
-- separate table rather than adding profile_id to company_research_cache
-- above: the cache row is a SHARED resource (one per job, read by every
-- matched seeker), while this table is PERSONAL (one row per seeker's own
-- spend event) — same "don't overload a shared row with per-caller
-- rate-limit state" reasoning as assessment_attempts/candidate_screening_answers
-- being separate, insert-only, per-attempt tables rather than counters on a
-- shared row. Caught in review: an earlier draft of this phase shipped with
-- NO rate limit on researchCompany at all — every other AI-consuming seeker
-- action in this codebase (skill-assessment attempts, screening-question
-- answers, AI refine chat) is daily-capped, and this is the one feature
-- whose spend lands on a metered third-party account (Brave) with a hard
-- quota, not just Modal's own containers.
create table company_research_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  job_posting_id uuid not null references job_postings (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index company_research_requests_profile_idx on company_research_requests (profile_id);
alter table company_research_requests enable row level security;
grant select, insert, update, delete on company_research_requests to service_role;
