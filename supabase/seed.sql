-- Dev-only seed: two demo accounts (password: J0B!Demo#2026$secure) with seeded points.
-- Demo seeker has a published, embedded profile so the matching flow can be
-- exercised immediately after `supabase db reset`.
-- NOTE: inserting into auth.users directly is a local-dev shortcut only.

-- GoTrue chokes on NULL string columns for hand-inserted users, hence the
-- explicit empty-string token/change fields.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'seeker@demo.local',
    crypt('J0B!Demo#2026$secure', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'recruiter@demo.local',
    crypt('J0B!Demo#2026$secure', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '',
    now(), now()
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"seeker@demo.local"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"recruiter@demo.local"}',
    'email', now(), now(), now()
  );

insert into profiles (id, is_seeker, is_recruiter, company_name, display_name, dealbreaker_matrix, draft_text, published_text, seeker_tier, recruiter_tier) values
  (
    '00000000-0000-0000-0000-000000000001', true, false, null, 'Demo Seeker',
    '{"min_salary": 90000, "currency": "USD", "work_setups": ["remote", "hybrid"]}',
    'Senior backend engineer, 8 years: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform serving 2M users.',
    'Senior backend engineer, 8 years: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform serving 2M users.',
    'free', 'free'
  ),
  (
    '00000000-0000-0000-0000-000000000002', false, true, 'Apex Talent Partners', 'Demo Recruiter', null, null, null, 'free', 'solo'
  );

insert into consent_flags (profile_id, reveal_override_enabled, tos_accepted_at, processing_consent_at, consent_version) values
  ('00000000-0000-0000-0000-000000000001', true, now(), now(), '2026-07-17-draft'),
  ('00000000-0000-0000-0000-000000000002', false, now(), null, '2026-07-17-draft');

-- Placeholder economics (see src/lib/points.ts): seeker seeded 10, recruiter 100.
insert into points_ledger (profile_id, event, amount, note) values
  ('00000000-0000-0000-0000-000000000001', 'seed', 10, 'seeker activation seed'),
  ('00000000-0000-0000-0000-000000000002', 'seed', 100, 'recruiter activation seed');

-- Pre-embedded skill vector for the demo seeker, matching the stub embedding
-- implementation (deterministic hash of published_text) is NOT reproduced here;
-- instead we leave the vector null-free by generating a fixed unit vector. The
-- ingest flow will replace it the first time the demo seeker republishes.
insert into skill_vectors (profile_id, redacted_text, embedding)
select
  '00000000-0000-0000-0000-000000000001',
  'Senior backend engineer, [YEARS] years: distributed systems, Postgres, event-driven pipelines, Kubernetes. Led payments platform serving [SCALE] users.',
  (select array_agg(1.0 / sqrt(1024))::vector(1024) from generate_series(1, 1024));
