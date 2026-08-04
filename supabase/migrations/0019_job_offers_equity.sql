-- Equity as an absolute dealbreaker boundary (BUSINESS.md §7 pillar 2 — the
-- dealbreaker matrix names three absolute boundaries: minimum salary, equity,
-- work setup). Job postings need an equity flag so the match RPC can enforce
-- "candidate requires equity -> only surface jobs that offer it".

alter table job_postings
  add column offers_equity boolean not null default false;
