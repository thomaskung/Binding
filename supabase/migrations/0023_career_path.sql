-- Seeker dashboard "Path" goal panel (DESIGN.md training-credits widget):
-- which career_path-track training_programs row the seeker has chosen as
-- their target. Nullable, no data migration — the goal panel is simply
-- omitted (same precedent as /seeker/points) until a seeker chooses a path.
alter table profiles
  add column career_path_program_id uuid references training_programs (id) on delete set null;
