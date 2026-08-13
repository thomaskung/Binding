-- Salary stealth completion (DESIGN.md §13a remainder). Stealth is the
-- default posture, disclosure the opt-in — this migration hardens both
-- sides of that:
--
--   1. New `band` salary_visibility value: a coarse bucket/range display
--      (see src/lib/jobs.ts salaryDisplay()) that sits between the exact
--      range (`public`) and fully hidden (`on_request`). Enum becomes
--      ('public', 'band', 'on_request') per DESIGN §13a.
--   2. job_postings.salary_visibility default flips 'public' -> 'on_request'.
--   3. profiles.share_salary default flips true -> false (seeker side made
--      symmetric — DESIGN §13a).
--   4. Existing-data migration: any job_postings row currently 'public'
--      becomes 'on_request', so the demo shows stealth everywhere, not only
--      on newly-created postings (same "existing rows migrated" discipline
--      0024 used for salary_min/salary_max). profiles.share_salary is NOT
--      backfilled here — unlike the job-posting default (set once, silently,
--      at posting-creation time), every profile save always writes an
--      explicit boolean for this column (see seeker/actions.ts + the
--      profile-fields.tsx toggle), so an existing seeker's prior explicit
--      choice is a real preference, not a stale default, and stays as-is.
--
-- NOT YET APPLIED to hosted staging as of this migration's authoring — see
-- the CLAUDE.md Gotchas entry (mirrors the 0023_career_path.sql precedent).
-- Verify against a scratch DB before `pnpm db:push`, per the migrations
-- gotcha in CLAUDE.md.

-- ── 1. Add the new enum value ───────────────────────────────────────────────
-- Postgres allows ADD VALUE inside a transaction as of PG12+ as long as the
-- new label isn't used in the same transaction — this migration never
-- writes 'band' anywhere below, only 'on_request', so that restriction isn't
-- implicated. Positioned `after 'public'` to match the documented ordering
-- in DESIGN §13a: ('public', 'band', 'on_request').
alter type salary_visibility add value if not exists 'band' after 'public';

-- ── 2. Flip job_postings.salary_visibility default ──────────────────────────
alter table job_postings alter column salary_visibility set default 'on_request';

-- ── 3. Flip profiles.share_salary default ───────────────────────────────────
alter table profiles alter column share_salary set default false;

-- ── 4. Backfill existing job_postings rows ──────────────────────────────────
update job_postings set salary_visibility = 'on_request' where salary_visibility = 'public';
