# Smoke-test dataset (dev only)

A larger, static dataset layered on top of `supabase/seed.sql`'s two demo
accounts: **50 seeker profiles + 20 job postings** across **20 role families
(10 tech, 10 finance)** and 8 fictional companies, with matches pre-computed
via the real `match_candidates()` RPC. Every seeker carries the full
recruiter-card surface (skills, industries, desired roles, seniority band,
years of experience, region, and a de-identified credentials summary), with
varied values so the card and its match ratios don't all look the same.

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

- `smoke-recruiters.json` — the 8 fictional companies (tech + finance), the
  one hand-edited source file.
- `generate-smoke-seed.ts` — holds the 20 role families and **procedurally
  generates** the 50 seekers + 20 jobs from them (deterministic seeded RNG, so
  the output is stable). Computes real stub embeddings (`src/lib/ai/stub.ts`,
  same code path the app uses) and the deterministic credentials floor
  (`src/lib/credentials.ts`), then emits the static SQL below. To change the
  dataset, edit the `FAMILIES` array (or `smoke-recruiters.json`) and
  regenerate. (Seekers and jobs are no longer hand-authored JSON.)
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
