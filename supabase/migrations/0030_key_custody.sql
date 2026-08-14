-- Client-held key custody (DESIGN.md §2g, MVP slice, Phase 10).
--
-- `resumes` gains an `encrypted` flag. An encrypted row's `raw_text` and
-- storage object both hold AES-256-GCM ciphertext as base64(nonce ||
-- ciphertext) — the nonce travels with the ciphertext rather than living in
-- its own column, since a single `enc_nonce` column can't unambiguously
-- describe two independently-encrypted artifacts (the extracted text and
-- the PDF binary) that each need their own nonce. This is a deliberate
-- simplification vs. the original plan's "encrypted/enc_nonce/enc_algo"
-- column list — see DESIGN.md §2g's Phase 10 built-note.
alter table resumes
  add column encrypted boolean not null default false,
  add column enc_algo text;

-- One row per profile: the AES-256 data key (DEK), wrapped (AES-GCM
-- encrypted) under a key derived entirely client-side from a WebAuthn `prf`
-- extension ceremony. The server only ever sees `wrapped_dek` — it has no
-- way to derive the unwrapping key, so it can never decrypt on its own,
-- including for its own DSAR-export or support tooling.
create table user_data_keys (
  profile_id uuid primary key references profiles (id) on delete cascade,
  wrapped_dek text not null,     -- base64(nonce || ciphertext)
  credential_id text not null,   -- base64 WebAuthn credential id used for the prf eval
  wrap_algo text not null default 'aes-256-gcm-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_data_keys enable row level security;
grant select, insert, update, delete on user_data_keys to service_role;

-- Recovery codes: the same DEK, wrapped again under a PBKDF2-derived key
-- from a one-time-shown code instead of the passkey — the escape hatch if
-- every enrolled passkey is lost. Hash-only storage (never the code
-- itself), same posture Phase 11's agent_tokens will use for bearer tokens.
create table user_data_key_recovery (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  code_hash text not null,        -- sha256(code), hex — never the code itself
  wrapped_dek text not null,      -- base64(nonce || ciphertext), PBKDF2-derived KEK
  salt text not null,             -- base64 PBKDF2 salt for this code
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index user_data_key_recovery_profile_idx on user_data_key_recovery (profile_id);
alter table user_data_key_recovery enable row level security;
grant select, insert, update, delete on user_data_key_recovery to service_role;

-- Append-only log of the one decrypt trigger this phase builds ("upload
-- processing" — the transient server-side text extraction a fresh upload
-- needs before the client encrypts it). Logs that access happened, never
-- the plaintext itself. Kept as its own table rather than folded into
-- `pii_access_log` (that table's own migration comment states owner
-- self-access is deliberately excluded from its charter) or the Phase 11
-- `agent_access_log` (a different agency again) — this is owner-self-access
-- under the upload-processing trigger specifically.
create table decrypt_access_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  purpose text not null,
  accessed_at timestamptz not null default now()
);

create index decrypt_access_log_profile_idx on decrypt_access_log (profile_id);
alter table decrypt_access_log enable row level security;
grant select, insert on decrypt_access_log to service_role;
