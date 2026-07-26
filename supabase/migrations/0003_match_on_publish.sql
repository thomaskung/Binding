-- Reverse-direction matching: when a candidate publishes/republishes their
-- profile, find all ACTIVE jobs they clear (similarity + dealbreakers) so the
-- publish action can upsert matches immediately. Without this, a candidate
-- entering the pool after a job was published stays invisible until the
-- recruiter happens to re-publish (gap found during the first manual demo).
-- Mirrors match_candidates() — keep the filter logic in sync.

create or replace function match_jobs_for_candidate(
  p_profile_id uuid,
  p_threshold real default 0.55,
  p_top_n integer default 20
) returns table (
  job_posting_id uuid,
  score real
)
language sql
security definer
set search_path = public
as $$
  select
    jp.id as job_posting_id,
    (1 - (sv.embedding <=> jp.embedding))::real as score
  from skill_vectors sv
  join profiles p on p.id = sv.profile_id
  join job_postings jp on jp.status = 'active' and jp.embedding is not null
  where sv.profile_id = p_profile_id
    and p.visibility = 'active'
    and p.role = 'seeker'
    and (
      p.dealbreaker_matrix is null
      or (p.dealbreaker_matrix->>'min_salary') is null
      or jp.salary_max is null
      or jp.salary_max >= (p.dealbreaker_matrix->>'min_salary')::integer
    )
    and (
      p.dealbreaker_matrix is null
      or p.dealbreaker_matrix->'work_setups' is null
      or jsonb_array_length(p.dealbreaker_matrix->'work_setups') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(p.dealbreaker_matrix->'work_setups') cand(setup)
        where cand.setup = any(jp.work_setups::text[])
      )
    )
    and (1 - (sv.embedding <=> jp.embedding)) >= p_threshold
  order by sv.embedding <=> jp.embedding
  limit p_top_n;
$$;

grant execute on all functions in schema public to authenticated, service_role;
