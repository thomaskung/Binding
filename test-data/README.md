# Seed dataset (shared source of truth)

> **Updated 2026-08-06:** local Supabase was retired, so this dataset is no
> longer auto-loaded by `supabase db reset` (there is none), and
> `supabase/seed.sql` — the two demo accounts it used to layer on top of — was
> deleted. The directory is deliberately **kept** because it is still the single
> source of truth for the seed dataset:
> - `scripts/seed-staging.ts` imports `buildJobs` / `buildSeeker` / `SEEKER_COUNT`
>   from `generate-smoke-seed.ts` (and reads `smoke-recruiters.json`) to seed
>   **hosted staging** with real Modal embeddings — run it via `pnpm seed:staging`.
> - `tests/test-data-seed.test.ts` guards the generated SQL artifact.

A static dataset of **50 seeker profiles + 20 job postings** across **20 role families
(10 tech, 10 finance)** and 8 fictional companies, with matches pre-computed
via the real `match_candidates()` RPC. Every seeker carries the full
recruiter-card surface (skills, industries, desired roles, seniority band,
years of experience, region, and a de-identified credentials summary), with
varied values so the card and its match ratios don't all look the same.

## Why it exists

A couple of hand-made accounts is enough to exercise one path, but not enough to
smoke-test list views, pagination, or the recruiter/seeker dashboards with a
realistic amount of data — hence a generated dataset with breadth and variety.

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
pnpm test-data:generate    # refresh smoke-seed.generated.sql (guarded by tests/test-data-seed.test.ts)
pnpm seed:staging          # push the dataset to hosted staging (real Modal embeddings)
```

All accounts share the password `J0B!Demo#2026$secure`. UUIDs stay namespaced by
prefix — `10000000-…` seekers, `20000000-…` recruiters, `30000000-…` jobs — which
also keeps them clear of the per-run `test-…@staging.local` users the e2e specs
create.
