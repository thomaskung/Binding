-- Per-field visibility for the seeker Profile/Résumé-canvas restructure
-- (Phase 2B of the Binding.dc.html implementation). Tri-state map, key ->
-- 'visible' | 'matching_only' | 'hidden', but 'matching_only' is only ever a
-- truthful option for the fields that actually feed the match embedding
-- (skills, desired_roles, industries, references_available — see
-- experienceFactsSentence in src/lib/experience.ts). For display-only fields
-- (headline, location) the app enforces visible/hidden only — see
-- src/lib/field-visibility.ts, the single source of truth for that
-- distinction. No new grants needed: profiles already has owner-only RLS
-- (0002_rls.sql), which covers this column like every other.
alter table profiles
  add column field_visibility jsonb not null default '{}'::jsonb;
