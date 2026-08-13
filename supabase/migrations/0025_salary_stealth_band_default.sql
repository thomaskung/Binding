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
--      0024 used for salary_min/salary_max). profiles.share_salary IS also
--      backfilled (true -> false) below — corrected reasoning: an explicit
--      profile *save* always writes a real boolean for this column
--      (seeker/actions.ts's updateProfileFields + the profile-fields.tsx
--      toggle both do), but the seeker onboarding *insert*
--      (onboarding/actions.ts's activateSeeker) does NOT — its `profiles`
--      upsert only sets id/is_seeker/display_name, so share_salary is left
--      to the column default at row-creation time. Every seeker who
--      onboarded before this migration therefore got the OLD default
--      (`true`) silently baked into their row, indistinguishable from a real
--      opt-in after the fact. Since we can't tell a genuine prior opt-in
--      from stale default data, we back it out the same way job_postings'
--      default flip is backed out above — the more defensible call for a
--      migration whose whole point is closing this exact stealth-by-default
--      gap, even though it means occasionally flipping a small number of
--      genuine `true` preferences along with it.
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

-- ── 5. Backfill existing profiles rows ──────────────────────────────────────
-- See the corrected reasoning in the header comment: activateSeeker's
-- onboarding upsert never wrote this column, so any row still `true` here is
-- indistinguishable stale-default data, not a verified opt-in — flip it,
-- matching the job_postings precedent above.
update profiles set share_salary = false where share_salary = true;
