# DSAR / Consent-Withdrawal Runbook (manual, private-beta)

**Status**: manual procedure for the private-beta window — self-service account
deletion ships before public launch (DESIGN.md §11). Referenced from
LEGAL_REVIEW.md. Statutory clocks: **PDPO (HK) data access request — 40 days**;
PDPA (SG) access/correction — "reasonably practicable", target the same 40-day
bar. The clock starts at receipt, not at triage — log the receipt date first.

## Intake

1. Requests arrive at privacy@getbinding.com (see `/privacy`). Log: date
   received, requester email, request type (access / correction / deletion /
   consent withdrawal), verification status.
2. **Verify identity** before disclosing anything: the request must come from
   the account's registered email (reply-to verification), or provide proof of
   control of that mailbox. Never fulfill a DSAR to a third party.

## Access request

1. Export, per profile (Supabase SQL editor or admin API, service role):
   `profiles` row, `resumes.raw_text` + stored file (the faithful DSAR copy —
   deliberately never pattern-stripped), `seeker_experience`,
   `consent_flags`, `points_ledger` entries, `matches`/`reveal_requests`
   involving the profile, `pii_access_log` rows where they are the subject.
2. Deliver as a single archive to the verified email. Do not include other
   users' data (thread messages include counterparty content — redact the
   counterparty's identity unless already disclosed to the requester via a
   reveal).

## Correction request

Point the user at in-app editing first (profile/resume editors cover almost
everything). For fields without a surface, correct via admin SQL and note the
change in the request log.

## Deletion request

Order matters — the ledger is append-only and other users hold references:

1. Delete `resumes` rows + storage objects (raw PII, owner-only).
2. Delete `seeker_experience`, `skill_vectors` (embedding + redacted text).
3. Null out PII columns on `profiles` (display_name → "Deleted user", phone,
   location, headline, draft/published text) — keep the row (FK target).
4. `points_ledger` is **append-only: anonymize, not delete** — the rows stay
   (they're the recruiter-side accounting record) but now reference an
   anonymized profile. Same for `reveal_requests`/`matches`/`pii_access_log`.
5. Revoke auth: delete the `auth.users` row (cascades sessions).
6. Record completion date in the request log.

## Consent withdrawal (short of deletion)

- Maintenance / market-signals: user can self-serve (profile settings toggles)
  — point them there; the timestamps clear immediately and the gated loops
  stop.
- Processing/profiling consent withdrawal = the service cannot run for them:
  treat as a deletion request after confirming that's the intent.

## Log

Keep the request log (a private sheet is fine at beta scale) with: received,
verified, type, actions taken, completed, days elapsed. This log is itself the
PDPA/PDPO accountability evidence.
