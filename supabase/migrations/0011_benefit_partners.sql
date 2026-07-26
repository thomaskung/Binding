-- Benefits/loyalty discount catalog (DESIGN.md §7b, reframed 2026-07-21 —
-- LEGAL_REVIEW.md Q8: no stored value, no payment nexus). Tier eligibility is
-- computed READ-ONLY from lifetime points earned (src/lib/benefits.ts) —
-- deliberately no currency/credit table here. Reaching or keeping a tier
-- never debits points_ledger; only the static partner catalog is schema.

create table benefit_partners (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  category text not null,
  discount_description text not null,
  code text not null,
  tier_required integer not null default 1,
  created_at timestamptz not null default now()
);

alter table benefit_partners enable row level security;

create policy benefit_partners_select on benefit_partners
  for select using (true);

grant select on benefit_partners to authenticated;
grant select, insert, update, delete on benefit_partners to service_role;

-- Static seed (real product content, matching the reviewed Benefits Catalog
-- mockup's own demo partners — same posture as training_programs' seed).
insert into benefit_partners (partner_name, category, discount_description, code, tier_required) values
  ('SkyQuest Airlines', 'flights', '12% off published fares, HK/SG routes', 'JOB-SKYQUEST-12', 1),
  ('Harborview Hotels', 'accommodation', '15% off best available rate', 'JOB-HARBOR-15', 1),
  ('Pulse Fitness', 'wellness', '20% off annual membership', 'JOB-PULSE-20', 2),
  ('NimbusCore IT', 'it_equipment', '10% off laptops and peripherals', 'JOB-NIMBUS-10', 2),
  ('Meridian Health', 'healthcare', '15% off outpatient consultations', 'JOB-MERIDIAN-15', 3),
  ('Compass Careers', 'career_advisory', 'One free 30-minute career coaching session', 'JOB-COMPASS-FREE', 3);
