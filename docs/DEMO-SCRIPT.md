# Binding — Investor / Cyberport-CCMF Demo Script

**Status**: draft click-track for a founder-driven live walkthrough. Finalize once the curated dataset + Modal are wired (this script assumes both). Runs on hosted staging; you are logged in, so the basic-auth gate is a non-issue. **Innovation headline to state up front and return to: the double-blind reveal economy** — skills + compensation matched *before* identity, the direct answer to APAC payslip-culture salary anchoring.

**Hero scenario**: an **HK fintech backend engineer** role + a curated pool of ~20+ synthetic HK candidates written to match cleanly. Everything below is real inference (Modal/Qwen3) on synthetic data — no real PII.

## Pre-flight (before the audience is watching)

1. Confirm `AI_PROVIDER=modal` on staging + Modal endpoints warm (hit the embeddings warm-up curl from `.github/workflows/e2e-staging.yml`).
2. Confirm the nightly-E2E + weekly-cleanup crons are **paused** for the demo window (they mutate/delete data).
3. Confirm the demo accounts exist and are seeded: hero seeker, hero recruiter, ≥20 opted-in candidates per shown market-intel segment.
4. Have the pre-vetted synthetic resume ready (its redaction output is verified clean).
5. Dry-run the whole script once.

## Spine 1 — Seeker journey (the privacy-first front door)

1. `/signup` → choose seeker. **Say**: "The candidate is a passive job-seeker who can't be seen looking — the payslip-culture retaliation problem."
2. Onboarding consent gate — point at the **three granular consents** (processing + automated-profiling required; continuous-maintenance optional). **Say**: "PDPA-grade consent, not a single bundled checkbox."
3. Resume step — paste the pre-vetted synthetic resume → **redaction preview**. **Say**: "Names, employers, contact details stripped before anything is matched. This is the Secure Vault." (Privacy proof point — Layer 0 + redaction.)
4. Dealbreakers → publish. **Say**: "They set a minimum salary and work setup — but never disclose current salary."
5. `/seeker/matches` — show match **bands** (high/normal/low), not raw scores. **Say**: "Seekers never see raw match scores — that's a recruiter-only signal; seekers get a qualitative band. Privacy and anti-gaming by design."
6. Express interest on the hero match.
7. `/training` — complete a short program → **points earned on screen**. **Say**: "The points economy rewards verified quality actions, not profile-farming."

## Spine 2 — Recruiter journey (THE headline: the reveal economy)

1. Switch to the recruiter account. `/recruiter/jobs/new` → the **HK fintech backend** JD → publish. **Say**: "Real AI matching, not keyword search — the JD is embedded and matched against the pseudonymized pool."
2. `/recruiter/jobs/[id]/matches` — pseudonymized candidates + `% match`. **Say**: "The recruiter sees skills-and-fit, not identity. This is the dark pool."
3. **Standard reveal** on the candidate who expressed interest → name + fit summary disclosed, points debit, thread opens. **Say**: "Consent-first: the candidate opted in, so the reveal is clean. Points priced the access."
4. **Override reveal** on a non-opted-in candidate → identity disclosed immediately, messaging gated on their accept, higher points cost. **Say**: "This is the monetization-friendly path — the recruiter pays a premium to reach a passive candidate pre-opt-in; the candidate is compensated regardless and can decline for a refund. Hurdles, not blockers."
5. `/thread/[id]` — send a message. **Say**: "All contact stays in-platform — that's the anti-leakage retention moat."

## Spine 3 — Data-moat adjacencies (the defensibility story)

1. `/recruiter/market-intelligence` — show the real HK-fintech signal (skill demand + salary by seniority). **Say**: "This is the data business inside the privacy business — aggregate, k-anonymized (≥20 people per cohort), never individual. The freshest structured APAC career dataset."
2. Show a **thin segment returning 'insufficient data'**. **Say**: "The k-anonymity guardrail working — below threshold we suppress, not approximate. Privacy is enforced, not promised."
3. `/benefits` — show the demo seeker's unlocked tier. **Say**: "Loyalty/benefits by lifetime engagement — a discount-code redirect, no stored value, no payment nexus."

## Spine 4 — Privacy proof points (privacy is the moat, demonstrable)

1. Re-show the redaction before/after on the pre-vetted resume.
2. Layer-0 pattern strip — paste text with an email/phone/HKID in the reverse-match/paste path; show the identifiers stripped **before transmission**. **Say**: "Deterministic contact-identifier removal at the client edge, before data leaves the device."
3. Mention `pii_access_log` — every cross-party identity disclosure is audited (append-only). **Say**: "We can prove who saw what."
4. `/account` — show account deletion (don't execute live). **Say**: "Full data lifecycle: cascade delete + points-ledger sanitization. PDPA/PDPO right-to-erasure, built."

## Close

Return to the headline: **"Skills and compensation match before identity — that's the trust-minimizing broker, and it's live and running on private AI you just watched."** Tie to HK: HK opco owns the privacy edge layer (grant-scoped R&D), HK-fintech beachhead, getbinding.com.

## Known honest caveats (say if asked, don't volunteer)

- Data is synthetic; matching/redaction are real (Modal/Qwen3).
- Billing isn't wired (points-only) — pre-revenue by design at this stage.
- Recruiter dynamic pricing / per-role budgets, job-supply automation, interview scheduling, AI-Credit Marketplace, enterprise ATS — all roadmap; see DESIGN.md §12.
