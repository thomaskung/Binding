-- points_ledger.id was the only non-UUID primary key in the schema (bigint
-- identity). Not a user id and RLS already scopes reads per profile, but a
-- sequential id leaks aggregate platform transaction volume to anyone who
-- diffs their own ledger ids over time — switch to uuid like everything else.
-- No application code reads or writes this column (verified 2026-07-18).

alter table points_ledger
  alter column id drop identity,
  alter column id drop default;

alter table points_ledger
  alter column id set data type uuid using gen_random_uuid(),
  alter column id set default gen_random_uuid();
