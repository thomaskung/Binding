# Smoke-test dataset (dev only)

A larger, static dataset layered on top of `supabase/seed.sql`'s two demo
accounts: 10 seeker profiles across distinct verticals (backend, data,
frontend, mobile, ML, DevOps, security, QA, product, design) and 11 job
postings across 4 fictional companies, with matches pre-computed via the
real `match_candidates()` RPC.

## Why it exists

`supabase/seed.sql` only seeds two accounts — enough to exercise one path,
not enough to smoke-test list views, pagination, or the recruiter/seeker
dashboards with a realistic amount of data.

## How it loads

`test-data/smoke-seed.generated.sql` is wired into `supabase/config.toml`'s
`[db.seed] sql_paths`, so it loads automatically after migrations on every
`supabase db reset` (and first `supabase start`) — no manual step. This only
ever runs through the local Supabase CLI stack; it's never applied to a
hosted/production project.

## Files

- `smoke-recruiters.json`, `smoke-seekers.json`, `smoke-jobs.json` — the
  human-readable source data.
- `generate-smoke-seed.ts` — reads the JSON, computes real stub embeddings
  (`src/lib/ai/stub.ts`, same code path the app uses) so match scores are
  realistic and varied, and emits the static SQL file below.
- `smoke-seed.generated.sql` — generated, checked-in output. Do not edit by
  hand; regenerate instead.

## Regenerating

After editing any of the source JSON files:

```
pnpm test-data:generate
pnpm db:reset
```

All accounts share the password `J0B!Demo#2026$secure`. UUIDs are namespaced
by prefix to avoid colliding with `supabase/seed.sql`'s demo accounts:
`10000000-…` seekers, `20000000-…` recruiters, `30000000-…` jobs.
