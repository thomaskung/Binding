-- Rate-limit log for the Résumé-canvas AI sidebar's free-text/chat path
-- (Pro-tier only, src/app/(app)/seeker/actions.ts refineProfileText). Fixed
-- quick-action chips (free tier) are NOT logged here — only custom/chat
-- instructions, which are the open-ended-cost surface worth capping. Same
-- rolling-24h-count-query shape as points.ts's countOverridesToday, not a
-- denormalized counter column, to match the codebase's existing convention.
create table ai_refine_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table ai_refine_log enable row level security;

create policy ai_refine_log_own_all on ai_refine_log
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on ai_refine_log to authenticated, service_role;
