-- skill_assessments.created_by (0033) had no `on delete` clause, defaulting
-- to RESTRICT — this blocks deleting the referenced profile/auth.users row
-- entirely, surfaced as GoTrue's generic "Database error deleting user" with
-- no indication of the real FK cause. skill_assessments is a durable,
-- recruiter-agnostic bank once published (created_by is attribution only,
-- not an ownership/visibility gate — see 0033's own "null for founder-seeded
-- rows" comment), so the row should survive its creator's deletion with
-- created_by nulled out, not block the deletion.
--
-- Found via the comprehensive-seed-data wipe (2026-08-18): a handful of
-- @staging.local test recruiters who had ever created a (test) skill
-- assessment during an e2e run could never be deleted by any cleanup path.
-- Looked up dynamically (not hardcoded as skill_assessments_created_by_fkey)
-- since this session had no way to confirm the actual auto-generated
-- constraint name against hosted staging before writing this migration.
do $$
declare
  fkey_name text;
begin
  select conname into fkey_name
  from pg_constraint
  where conrelid = 'skill_assessments'::regclass
    and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'skill_assessments'::regclass and attname = 'created_by')];

  execute format('alter table skill_assessments drop constraint %I', fkey_name);
  execute 'alter table skill_assessments add constraint skill_assessments_created_by_fkey foreign key (created_by) references profiles (id) on delete set null';
end $$;
