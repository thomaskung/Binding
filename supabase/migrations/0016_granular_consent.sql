-- Granular consent split (DESIGN.md §2a/§2c, LEGAL_REVIEW.md Q14 — decided
-- 2026-07-28): the single AI-processing consent becomes three distinct
-- consents. Processing/redaction and automated-profiling-for-matching are
-- REQUIRED to use the service (they are the service); continuous AI
-- maintenance is OPTIONAL and independently withdrawable — forcing consent
-- to a non-essential feature is the classic invalid-consent pattern under
-- PDPA, and the product works ingest-once without it.

alter table consent_flags
  add column profiling_consent_at timestamptz,
  add column maintenance_consent_at timestamptz,
  add column maintenance_consent_version text;

-- Backfill profiling consent for pre-split rows: profiling was inseparable
-- from the original processing consent's scope (matching IS what processing
-- fed), so existing consented profiles carry it forward at the same
-- timestamp. Maintenance stays NULL — it is a new, optional grant that must
-- be given explicitly (JIT prompt at first maintenance use).
update consent_flags
set profiling_consent_at = processing_consent_at
where processing_consent_at is not null;
