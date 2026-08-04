# DESIGN.md — Binding (formerly JumpOnBoard) Technical Architecture

**Version 2.4** · Last updated 2026-08-04 · Revision history at the end of this document.

Companion to [BUSINESS.md](./BUSINESS.md) (strategy/pitch) and [VISION.md](./VISION.md) (goals/metrics). This document describes how the product is actually built. Status: walking-skeleton MVP implemented (see §12 for what's built vs. deferred and where the MVP diverges from the target architecture below).

## 1. System Overview

Solo-founder, AI-assisted ("vibe coding") build. Architecture favors managed services and low operational overhead over anything requiring dedicated ops/on-call.

Components:
- **Frontend**: Next.js (React) web app — candidate/recruiter/enterprise portals, in-app messaging (built). In-app interview scheduling is roadmap (table-ready, no UI).
- **Backend**: Supabase (Postgres) hosted in AWS ap-east-1, with pgvector for embedding similarity search and Row Level Security (RLS) as the primary access-control layer.
- **Matching/AI service**: serverless LLM inference (Modal or Baseten, open-weight models — Llama 3 / Mistral) for resume redaction, embedding generation, and skill assessment content.
- **Points ledger service**: closed-loop, non-monetary credit system (earning, spending, refunds, reveal compensation).
- **Messaging service**: in-app only — a retention mechanic, not a convenience feature (see §4). Built. (Interview scheduling on top of a thread is roadmap — `interview_schedules` table exists, no UI.)
- **AI-Credit Marketplace gateway** (fast-follow, post-MVP): API proxy issuing OpenAI-compatible keys, metered against points balance.

## 2a. Registration & Roles (added 2026-07-17)

- **Dual-role accounts, both opt-in**: one account can hold seeker and/or recruiter roles (`profiles.is_seeker` / `is_recruiter`), activated independently. Header switcher when both are held; opt-in CTA for the missing role. `/` routes to the last-used role (cookie), defaulting to seeker.
- **Seeker activation** — guided wizard: (1) name + ToS + **granular consent gate** (split 2026-07-28, migration 0016, LEGAL_REVIEW.md Q14): AI-processing/redaction consent and **automated-profiling (matching) consent** are both REQUIRED — they are the service; **continuous-AI-maintenance consent is OPTIONAL and independently withdrawable** (profile-settings toggle mirroring the market-signals pattern; a just-in-time consent prompt at the nudge surface covers later enablement — forcing consent to a non-essential feature is the classic invalid-consent pattern under PDPA). Timestamps + versions stored per consent for future re-consent. (2) resume + redaction preview, (3) dealbreakers → publish. Steps 2-3 skippable; dashboard shows a finish-profile banner until published.
- **Recruiter activation**: name + **company/agency name (required)** + ToS. Company shows on job cards and thread headers — candidates always see who's contacting them. Recruiter identity is deliberately readable by signed-in users (RLS policy), unverified for now (verification on roadmap).
- **Self-match exclusion**: matching RPCs exclude `profile_id = job.recruiter_id` — dual-role users never see themselves as candidates for their own jobs.
- **Points**: single shared balance; +10 seed on seeker activation, +100 on recruiter activation (idempotent per role).

## 2b. External Job Supply & Cold-Start Strategy (strategy/roadmap — not yet built)

**Status**: recorded architecture decision and roadmap only, same treatment as §7 AI-Credit Marketplace (documented ahead of build). No schema, ingestion code, or UI exists for any of this yet — see MEMORY.md for the dated decisions and BUSINESS.md §9 for the GTM framing.

**The problem**: VISION.md already identifies supply-side liquidity as the hardest problem for a two-sided marketplace at launch. The founder asked whether scraping Indeed for job postings — matching them against candidates, then redirecting to the original ad/headhunter — would be legally safe on the reasoning that job ads are public and searchable. Researched and rejected (see below), which forced a real redesign of how Day-1 job supply gets built.

**Rejected: scraping Indeed.** CFAA protection for scraping publicly-visible data is real (*hiQ Labs v. LinkedIn*) but narrow — it only defeats one specific legal theory (federal computer-fraud). It does not touch breach-of-contract exposure under a site's Terms of Service, which is a separate, live legal theory that survives the CFAA carve-out entirely. Indeed's ToS explicitly prohibits automated/robotic access and unauthorized aggregation, and this exact enforcement pattern is active in the industry: LinkedIn won a 2026 breach-of-contract case against scraper Proxycurl/Nubela on precisely these grounds, and separately pursued ProAPIs. Indeed has the same contractual teeth and active anti-scraping technical measures; the absence of a public Indeed lawsuit against a scraper is not evidence of safety, just an absence of an observed test case. Indeed also has no public read-API for third parties (its Publisher API was deprecated in 2023) — there is no sanctioned channel to pull from Indeed at all. Deep-linking to the original posting instead of storing/republishing the full JD text is meaningfully lower-risk (avoids copyright exposure, up to $150K/work if willful) but does not eliminate the contract-breach exposure if the underlying harvesting was itself prohibited automated scraping.

**Also rejected as *reasoning* (though the underlying mechanism it points to is legitimate): "Google for Jobs does this at massive scale, legally, so this must be fine."** Google's safety rests on two separate things, and only one of them transfers to a startup:
- **Transfers**: Google for Jobs indexes listings that carry `schema.org/JobPosting` structured data — markup employers and job boards **voluntarily embed specifically to be indexed for job search**. This is the same opt-in-signal logic as an ATS public API (below), just via a different technical channel (crawling career pages for valid markup rather than calling a documented API endpoint), and it is a legitimate additional discovery channel.
- **Does not transfer**: Google separately benefits from a distinct legal privilege that general-purpose search engines receive and vertical commercial aggregators do not — courts give search engines materially more fair-use latitude for crawling/indexing/displaying snippets (*Field v. Google*, *Perfect 10 v. Amazon* — both favorable specifically because Google functions as a non-substitutional public discovery tool). A commercial matching platform doing the identical technical thing is legally closer to *AP v. Meltwater*, where a commercial news aggregator **lost** specifically because its use substituted for the source rather than complementing it. **"It's public/searchable, so it's fine" is exactly the reasoning that was already rejected once for Indeed — Google's example doesn't resurrect it.** The actual safety in the design below comes from the consent-gated staging pipeline and always-deep-link posture, not from resembling how Google crawls.

**Adopted: a two-stage, consent-gated job-supply pipeline.**

*Stage 1 — private discovery (ops-only; never candidate-visible, never embedded, never matched).* Auto-discover candidate leads from two parallel channels:
1. **ATS public syndication APIs** — Greenhouse (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) and Lever (`api.lever.co/v0/postings/{slug}`) first: both publish public, unauthenticated job-board APIs specifically intended for third-party consumption (unlike Indeed), and are the most common ATS among tech/finance startups — matching the existing unsequenced tech+finance HK/SG beachhead (BUSINESS.md §9). Ashby/SmartRecruiters are documented alternatives, not prioritized for the first build.
2. **`schema.org/JobPosting` markup on individual company career pages** — the transferable part of the Google-for-Jobs mechanism, always respecting `robots.txt`.

Neither channel is sufficient on its own to publish a listing: even ATS public APIs carry a **redistribution-consent caveat** distinct from what the employer wants — Greenhouse's own Master Subscription Agreement restricts third-party redistribution of data pulled through its API independent of the employer's wishes. Discovery only ever populates a private staging area; nothing from Stage 1 is ever shown to a candidate.

*Stage 2 — consented promotion.* A discovered listing becomes live/matchable only after the employer explicitly consents, via a lightweight one-time claim link (not a full admin dashboard — consistent with the solo-founder/lean posture elsewhere in this document). **Claiming is always free.** The paid ask (Pro/Enterprise) is deferred until after the employer has experienced a real match — the same sequencing already used for independent headhunters in BUSINESS.md §9 ("convert to paid only after experiencing reveal quality"), now applied explicitly to this new path. Removes the exact friction that kills employer-side cold start: asking for payment before there is any proof of candidate quality.

**Reveal path for unclaimed, ATS-sourced jobs is limited**: surfaced to candidates and deep-linked to the original posting, but the reveal economy (standard or override, §4) does not activate until the employer has claimed the listing and holds a real recruiter account. This doubles as the monetization bridge — free automated supply converts into a paying customer at the moment of claim.

**Candidate-side cold start — two mechanisms, deliberately not dependent on job-supply volume:**
- **Candidate-paste reverse-match ("check a job you found")**: the candidate pastes the **JD text itself** — required, and this is the *only* mode, never a fallback. A URL/label field, if given, is stored as-is for the candidate's own reference and is **never fetched by the server**. This is deliberate on two fronts at once: it sidesteps the paywall/login-wall problem entirely (a URL behind a login can't be server-fetched anyway, and the candidate is already viewing content they personally have access to), and it keeps this feature in the "individual, personal, one-off copy-paste" category identified as categorically lower-risk than bulk automated harvesting during the Indeed research. No shared job-posting row is created and no reveal economy attaches — informational only (fit score + AI summary against the candidate's own published profile), same "surface + deep-link, no reveal economy yet" principle applied to this channel too.
- **Dual acquisition hooks, no single primary**: "check a job you found" (zero-commitment, standalone value, doesn't require believing the marketplace has liquidity yet) and the existing free AI resume rewrite (points-economy redemption, framed as a no-cost trial) run as parallel entry points. Either one builds a candidate's profile/skill vector as a side effect of a low-commitment action, seeding the candidate pool without requiring marketplace liquidity to exist first.

**Launch sequencing — a readiness gate, not just a calendar date.** Public signups do not open until both a minimum candidate density and a minimum consented/claimed employer density exist in the target vertical (starting targets, adjustable: ~50 real candidate profiles, ~15 consented/claimed ATS-sourced postings — see VISION.md). The existing Oct 2026 date remains the *build* target; public opening is gated on density, so "a solid match from Day 1" is literally true for the first real public users rather than aspirational. This makes the ATS-feed/schema.org tooling primarily a **concierge-outreach accelerant** (auto-discovered leads with real current openings + a one-click consent link, instead of cold manual research) rather than a way to skip relationship-building entirely — a pre-launch outreach sprint is still required, just a much faster one.

## 2c. Resume-First Onboarding & Continuous AI Maintenance (built)

**Status (corrected 2026-07-23 — this line previously said "not yet built," which was stale)**: live. Resume-first onboarding, the lazy-on-login staleness check, and the maintenance-nudge suggest-and-approve loop (`/seeker/nudge`, `requestMaintenanceDraft`/`acceptMaintenanceUpdate` in `src/app/seeker/actions.ts`) all ship, with e2e coverage in `e2e/maintenance-nudge.spec.ts`. Scheduled/email reminders (below) remain deferred, not MVP.

**The problem it solves**: traditional profile-maintenance UI puts the upkeep burden on the user. Free-tier users won't spend time keeping a profile current, so they update only when actively job-hunting — which is exactly when their data is *least* useful to the passive dark pool. Stale profiles starve the recruiter side (the supply-side liquidity problem in VISION.md) and force recruiters back to "please send me your latest resume," reintroducing the friction the product exists to remove.

**The pivot**: make **resume submission the front door**, and have an AI agent **continuously maintain** the resume so the user never has to hand-edit fields. Binding becomes the user's de-facto lifelong resume maintainer — a retention/stickiness moat, and the mechanism that keeps the dark pool's data fresh by construction.

- **Consent-before-processing ordering constraint (non-negotiable)**: PDPA/PDPO §5-style consent covering the AI redaction/processing step must be captured *before* the resume is ingested. "Resume-first" therefore means resume upload is the *first substantive step* after a minimal consent gate — never literally before consent. The existing seeker wizard (§2a: name + ToS + AI-processing consent → resume → dealbreakers) is re-sequenced, not bypassed: the consent gate stays first, resume moves up to be the primary action, dealbreakers follow.
- **AI extracts, user approves**: on upload, the AI parses the resume and drafts structured fields (skills, desired roles, industries, `seeker_experience` entries) into the existing structured layer via **suggest-and-approve** — the same pattern already used for resume/JD refinement. The resume becomes the source of truth; structured fields are AI-derived-then-user-confirmed.
- **AI-never-fabricates invariant**: the maintenance agent only restructures, rephrases, or files facts the user explicitly supplied (via the resume or a maintenance answer). It never infers, embellishes, or invents accomplishments, titles, or dates. This is a fairness/integrity guardrail consistent with the tenure-not-employer-prestige stance already encoded in `src/lib/experience.ts` — a fabricated accomplishment could drive a match and be disclosed to a recruiter on reveal, so the guardrail is load-bearing, not cosmetic.
- **Maintenance-loop triggers** (all of them, phased):
  - *Lazy-on-login + staleness check (MVP path)*: on login, if the profile is stale (past a freshness window, or a tenure milestone has elapsed since last update), surface a maintenance nudge ("Still at Company X? Anything new since <date>?"). No cron — consistent with the existing lazy-evaluation pattern used for override expiry (§4).
  - *Consent gate (added 2026-07-28)*: both halves of the loop (`requestMaintenanceDraft`/`acceptMaintenanceUpdate`) refuse to run without `maintenance_consent_at` (§2a — optional, withdrawable). The nudge surface shows a just-in-time enable-and-continue prompt instead of silently processing. This is also the **PDPA Accuracy Obligation** posture, stated plainly: suggest-and-approve + AI-never-fabricates means every committed change was explicitly user-approved — the user's approval, not the AI, is what vouches for accuracy in data used for consequential hiring decisions (LEGAL_REVIEW.md Q15).
  - *User-initiated*: an always-available "update my profile" entry point.
  - *Scheduled / email reminders (deferred)*: proactive time-based nudges independent of login. Needs the Resend SMTP swap (§12) plus a scheduler the design has so far deliberately avoided — documented as a later-stage addition, not MVP.
- **Manual entry stays as a fallback**, never removed: users without a resume, career-changers, and anyone who prefers direct editing must still be able to build/edit the structured layer by hand. Resume-first is the default path, not the only one.
- **Freshness-confirmation earning (added this revision — see BUSINESS.md §6a/§3)**: answering a maintenance nudge with a genuine suggest-and-approve update earns points, **rate-limited** (e.g. once per quarter, or once per crossing a tenure milestone) so it can't be farmed by repeatedly re-triggering the nudge. This is deliberately *not* marketed as "AI-verified" — the AI enforces the rate limit and the suggest-and-approve shape, but it cannot independently verify that a self-reported "still at Company X" or a new accomplishment is true, unlike a skill-assessment pass. The rate limit plus the requirement that it's a real maintenance event (not a raw field edit) is what preserves the existing anti-farming rule, not a verification claim the mechanism can't back up.

**Privacy consequence — the invariant this whole pivot hinges on**: raw resumes are already retained owner-only today; continuous maintenance changes the raw resume from a *persisted-but-static input* into a *continuously-updated, longer-retained, PII-bearing asset* (a deepening of an existing asset, not a new retention of something previously discarded). See §5 for the owner-only / unchanged-redaction-boundary / expanded-retention-consent invariant that keeps "we maintain your resume" and "privacy-first" from contradicting each other.

## 2d. Adaptive UI (state-driven, not generative) (built)

**Status (corrected 2026-07-23)**: live on `/seeker` — the profile-state machine (completeness/freshness/intent/role) drives which module surfaces, including the stale-nudge card. Match-band-cap and ranking-boost-disclosure invariants below remain load-bearing and testable against real code, not just a strategy note.

The founder asked whether the UI should become generative — changing according to profile, preference, and resume. Decision: **adaptive/state-driven UI, not runtime-generative UI.**

- **What we build**: deterministic components; a **profile-state machine** decides *which modules surface and in what priority*; AI generates *content* (nudge copy, suggested edits, summaries) inside fixed, testable slots — never markup at render time.
- **State axes**: completeness (draft / published), freshness (fresh / stale by last-update or tenure-milestone), intent (active vs passive looker), role (seeker / recruiter / dual). Example mappings: incomplete → finish-profile flow forward; passive + stale → maintenance nudge forward; active seeker → matches forward; dual-role → role-appropriate surface via the existing switcher.
- **Why not runtime-generative** (considered and rejected): an LLM emitting UI markup per render is (a) not deterministically testable, which breaks the standing unit+e2e convention (CLAUDE.md); (b) expensive per render; (c) an accessibility and injection-surface risk (untrusted markup rendered into the app). Adaptive-with-AI-content-in-fixed-slots captures ~90% of the intent while staying green under Playwright.
- **Match-band-cap invariant (added 2026-07-21)**: any adaptive-dashboard state that renders a match card must reflect the already-shipped `seeker_tier` cap (`matchBand()`, `src/lib/matching.ts` — `high` caps to `normal` unless `seeker_tier='pro'`), with **no differential signal** for a capped match — it must be fully indistinguishable from a genuine `normal` match, across every frame/state that shows matches (a dual-role frame is not exempt just because it also shows a recruiter view). A true, uncapped `high` state may only ever appear in a separately, explicitly-labeled Pro-tier frame. This guards against UI work silently reintroducing the privacy leak a first draft of the adaptive dashboard mockup had.
- **Ranking-boost disclosure (added 2026-07-22)**: a boosted job posting (§4a) must carry a visible "Promoted" label on the seeker-facing card, in every frame that renders it. This is a distinct signal from the match-band-cap invariant above (sponsorship disclosure vs. match-quality signal) — both must coexist on the same card, neither substitutes for the other.

## 2e. Aggregate Signal Pipeline — privacy-preserving monetization (built)

**Status (corrected 2026-07-23)**: live. `market_skill_demand`/`market_salary_trend` (migration `0012_market_signals.sql`) are the sole, security-definer, k-anonymized access path, consumed by `src/app/recruiter/market-intelligence/`; unit coverage in `tests/market-signals.test.ts`. Comp/bonus/commission/equity dimensions (BUSINESS.md §7 item 4a) are not yet added to these RPCs — that expansion is still roadmap.

The data Binding collects (fresh, structured, continuously-maintained career data) is a monetizable asset **only in aggregate, non-identifiable form**. PII is never sold or shared. This is a data-collection business *within* privacy-first, not a departure from it (see BUSINESS.md §3/§7).

- **Opt-in, separate consent**: a profile feeds the aggregate-signal product only after the user gives a **separate** opt-in consent, distinct from the AI-processing consent (extend the `src/lib/consent.ts` / `CONSENT_VERSION` mechanism). Privacy stays the default.
- **Hard k-anonymity threshold**: no aggregate signal (e.g. "expected salary raise for Rust engineers in SG," "in-demand skills in HK fintech," hiring velocity) is ever computed, surfaced, or sold unless the underlying cohort is **≥ k distinct opted-in people** (starting target **k≥20**, exact value pending counsel — see LEGAL_REVIEW.md). Below threshold the signal is **suppressed entirely**, not approximated. In small/niche APAC verticals this is what actually makes "non-identifiable" true (§5 flags small pools as the re-identification danger) and is the basis for arguing the aggregates fall outside PDPA/PDPO "personal data" scope.
- **Optional noise (future)**: differential-privacy-style noise on published figures is a documented future hardening, not required for the first version once k-thresholding is in place.
- **Outputs are aggregate-only**: the signal product never exposes, ranks, or links an individual profile. It reads from opted-in, k-thresholded cohorts and emits statistics.
- **Invariants unchanged**: only the redacted/generalized skill vector is ever matched (§3), and only k-anonymized aggregates from opt-in profiles ever leave for the signal product. The frontier-guardrail invariant (`JDTextOnly`, `tests/frontier-guardrail.test.ts`) still holds.

## 2f. Layered Privacy Architecture — Edge/Core target + per-layer controls (founder directive 2026-07-28)

**One-line shape**: *Layer 0 client · Layer 1 edge (raw PII, in-jurisdiction) · Layer 2 core (pseudonymized, SG) · Layer 3 internal (masked, break-glass, audited).* Tagline: **"Privacy at the edge, Security at the core."** Prompted by PROBLEM.md's centralization critique (Problem 5); this section is the adopted answer. Status: **target architecture with a phased path** — Layers 0 and 3-schema are built now; the physical edge/core split is roadmap with named promotion triggers.

**The two-layer target (roadmap — not MVP):**
- **Layer 1 — edge**: per-jurisdiction regional data store + in-jurisdiction redaction GPU for B2C seekers (HK edge for HK users, SG edge for SG users): raw resumes, PII-bearing structured data, and the redaction compute never leave the user's jurisdiction. The same layer-1 component packages as a **customer-VPC deployment** for enterprise B2B — redaction runs inside the client's environment; raw employee/candidate data never leaves it.
- **Layer 2 — core (Singapore, SG opco)**: pseudonymized text + vectors only — matching, reveal orchestration, points ledger. **Pseudonymized is not anonymized**: core stays within PDPA/PDPO scope, with transfer posture from each edge (inter-opco DPA, PDPO s.33 — LEGAL_REVIEW.md Q17). The reveal flow crosses layers by design: name disclosure fetches identity from the owning edge at reveal time (cross-layer service-token/mTLS API — part of the design, not an afterthought).
- **VPC boundary trade-off, named honestly**: raw stays in the client VPC, derived vectors flow to the SG core under DPA — this keeps ONE matching pool (the marketplace network effect). Strictest clients may still decline; a full-tenant deploy (nothing leaves) was considered and rejected — it kills cross-company matching and is ops-heavy for a solo founder.
- **MVP reality + why physicalizing later stays cheap**: MVP is single-region Supabase ap-east-1, lawful for HK+SG under transfer safeguards (research 2026-07-28: PDPA imposes **no data-residency mandate** — §26 comparable-protection standard). The RLS design is already the *logical* edge/core split: raw PII owner-only; matching sees only redacted text + vectors via `match_candidates`. **Schema discipline (binding from now on)**: no new feature may join raw-PII tables (`resumes`, `seeker_experience`, name/contact fields) into core-side query paths — so physicalization stays a data-move, not a redesign.
- **Promotion triggers**: first enterprise deal · ESS grant application (the HK edge layer is the grant-scoped R&D — BUSINESS.md §10a) · entry into a residency-mandating market (e.g. China PIPL).

**ZK-FL rejected-with-reasoning** (same doc pattern as §2b's Indeed rejection). PROBLEM.md proposed Zero-Knowledge Federated Learning for enterprise B2B. Deep-research verification (2026-07-28, adversarial 3-vote panel): the claimed numbers (99.97% payload reduction, 77% latency vs homomorphic encryption, "completely eliminates gradient leakage") **appear in no paper**; no ZK-FL-vs-HE head-to-head benchmark exists; surveyed implementations (ZKFL-PQ, Veri-CS-FL) are experimental (~20× compute overhead, zero production deployments found 2024-2026); AI Verify and Project Moonshot are **LLM-governance/safety testing frameworks, not cryptographic certifications** — ZK-FL would not help pass them. What Singapore enterprise procurement actually asks for: deployment residency options (the VPC edge above), SOC 2 / ISO 27001, PDPA DPAs, pen-test evidence (CREST — BUSINESS.md §11), AI Verify participation as a governance signal. ZK-FL is a **far-future-watch** item — revisit only if production deployments appear in regulated industries.

**Per-layer controls matrix** (low-cost discipline: every control is either built now or deferred **with a named trigger**):

- **Layer 0 — client-side (built 2026-07-28)**: PDF metadata strip at ingest before storage (Info dict + XMP — `src/lib/pdf-metadata.ts`); deterministic contact-identifier pattern redaction (`src/lib/pii-patterns.ts` — emails, HK/SG phones, NRIC/FIN incl. M-series, HKID incl. A-check-digit) — **in-browser on the paste-text path** (identifiers never leave the device), reused server-side at ingest on the PDF path's returned draft (`resumes.raw_text` stays the faithful owner-only DSAR copy, never pattern-stripped); PII preview notice with path-honest copy; consent-gate-before-file-picker ordering (§2a); zero-third-party-resources assertion on resume pages (`e2e/no-third-party.spec.ts`). Rejected as theater: client-side NER redaction (LLM-quality work — that's Layer 1's job), browser E2EE with server-held keys. Deferred with trigger: full nonce-CSP via edge middleware (before public launch).
- **Layer 1 — edge / raw PII (`resumes`, `seeker_experience`, name/contact, `consent_flags`)**: now — Supabase at-rest AES-256 + TLS (platform default), owner-only RLS, consent-before-processing, append-only `pii_access_log` (migration 0017, cross-party access only — owner self-access deliberately unlogged to keep the signal), bounded-retention commitment, service-key hygiene, manual DSAR runbook (`docs/DSAR_RUNBOOK.md`). Deferred with triggers: column-level encryption of contact fields (enterprise-VPC phase), pgaudit/log shipping (post-revenue), in-jurisdiction redaction GPU (edge physicalization; interim: Modal `region="ap"` pin, §12). (Account-deletion self-service is now **built** — `/account`, `deleteAccount` with anonymize-not-delete ledger sanitization; §11/§12.)
- **Layer 2 — core (vectors, redacted text, `matches`, `points_ledger`, aggregates)**: now — no-vector-egress invariant (only `profile_id, score, redacted_text` leave `match_candidates`; embeddings never reach any client), seeker band-only scores (`matchBand` cap, §2d), **standard-reveal daily cap** (`REVEAL_DAILY_CAP`, env-tunable, 10/day placeholder — closes the gap where §5 claimed "rate-limited reveals" but only overrides were capped; cap checked before balance for deterministic errors; it binds at the affordable burst under seed economics and becomes fully load-bearing when top-ups ship) + existing override guardrails (§4), k≥20 aggregate threshold (§2e), `JDTextOnly` frontier guardrail, append-only ledger, guard-invariant unit tests (`tests/reveal-invariants.test.ts` — the CI tripwire for the accepted admin-client pattern). Deferred with triggers: DP noise on embeddings (§5 — after matching-quality cost is measured), DP noise on published aggregates (§2e), definer-RPC migration of ledger writes (if invariant tests prove insufficient), reveal-velocity anomaly detection (post-revenue).
- **Layer 3 — internal access (ops panel is roadmap; controls designed now, schema ready)**: masked-by-default PII views (initials, redacted contact) — support workflows designed masked-first; break-glass unmask requires a reason, is time-boxed, and writes to `pii_access_log` (`accessor_role`/`reason` columns shipped in 0017); **outsourced-TA-service firewall** — TA staff operate as *internal recruiters* (same pseudonymized surface, same reveal economics/caps/audit; existing recruiter-matching consent covers it) and the TA role NEVER combines with ops-admin (no privileged raw-profile search — LEGAL_REVIEW.md Q18); key custody/rotation policy at first hire; no-bulk-export rule in any internal tooling; NDA/policy paperwork.

**Layer-0 ↔ reveal reconciliation** (easy to blur when editing): pattern redaction applies to **free-text resume content only**. Canonical identity is structured, owner-controlled data — reveal identity is `profiles.display_name`, disclosed only via the `reveal_requests` join. *Recruiter-visible free text is redacted of identifiers — deterministic for contact patterns, LLM-based (best-effort) for names/employers; identity flows only through the consent-gated, paid, audited reveal channel.* Recruiters verify identity and arrange interviews from that structured path, never from resume text. Contact sharing (`consent_flags.contact_sharing_consent`) is **designed-not-built**: the flag exists with zero reads and no seeker contact-disclosure field yet.

## 2. Data Model (sketch)

- `users` — role: seeker / recruiter / enterprise_admin
- `profiles` — seeker profile, pseudonymized display fields, dealbreaker_matrix (min salary, equity, work setup)
- `resumes` — raw upload (access-restricted), linked to derived `skill_vectors`
- `skill_vectors` — pgvector embeddings + redacted/generalized metadata, no raw PII
- `job_postings` — recruiter/enterprise-authored, JD embeddings
- `matches` — candidate↔job pairing with score, status (surfaced / interested / declined / revealed)
- `reveal_requests` — scoped **per role** (job_posting_id + profile_id), path: `standard` (post opt-in) or `override` (paid, pre opt-in), status, refund state
- `points_ledger` — append-only: earn/spend/refund/compensation events, source type, balance
- `verified_actions` — skill assessment completions, work-history verification signals (gates point-earning)
- `messages` / `message_threads` — scoped to a reveal_request; no contact info in transit until candidate consent recorded
- `interview_schedules` — linked to a message_thread
- `consent_flags` — per-profile: reveal-override enabled/disabled, contact-info-sharing consent

## 3. Matching Pipeline

1. **Ingest**: resume uploaded → queued for processing.
2. **Redact/pseudonymize**: LLM strips name, employer names, direct contact info; quasi-identifiers (rare skill+location+tenure combos) are generalized where feasible. This step has known limits — see §5.
3. **Embed**: skill vector generated via open-weight model, stored in pgvector.
4. **Match**: similarity search against job-posting embeddings, filtered by the candidate's Dealbreaker Matrix (min salary, equity, work setup).
5. **Surface**: match shown to candidate (always) and, once the candidate opts in, to the recruiter.
6. **Reveal**: paid, per-role — see §4 for the full mechanic.

## 4. Reveal & Engagement Mechanics (the retention moat)

This is a distinct subsystem, not a one-line feature — it's the core answer to marketplace leakage (why recruiters and candidates don't just move the relationship off-platform after one hire).

**Default path — double opt-in:**
- A match is surfaced to the candidate first. Candidate must actively express interest before any Reveal Request can be sent.
- Recruiter sends a Reveal Request → candidate's name + job-fit summary disclosed. Contact info (email/phone) stays withheld unless the candidate separately consents.
- All recruiter↔candidate contact happens through in-platform messaging (`message_threads`), never direct email/phone by default.

**Override path — paid, pre-opt-in reveal (implemented 2026-07-17; placeholder economics):**
- **25 pts total** (10 base + 15 engagement premium) vs. 10 for a standard reveal. Name + fit summary disclose **immediately at payment**; the candidate's accept/decline gates **messaging only**.
- Candidate declines → recruiter refunded the **15-pt premium** (the 10-pt base pays for the look they got).
- Candidate compensated **5 pts** at reveal creation (vs. 3 standard — bigger privacy cost), **regardless of outcome** — the incentive to leave override enabled.
- **Per-candidate toggle** (`consent_flags.reveal_override_enabled`): if disabled, no override at any price. Paused profiles are also fully shielded from overrides. Privacy-first by default.
- **Guardrails**: 5 overrides/day per recruiter (standard reveals uncapped); a decline blocks that recruiter from re-overriding that candidate (any job) for 30 days; pending overrides auto-expire after 7 days (treated as decline — premium refunded, block applies), evaluated lazily on read (no cron). Override only applies to `surfaced` matches — never candidate-declined ones. All constants env-tunable.
- Notifications are in-app only for MVP (pending-override card on the seeker dashboard); email notifications wait for the Resend SMTP swap.

**Per-role scoping & pricing:**
- A reveal only unlocks a candidate for the specific job posting it's tied to. Revealing the same candidate against a different posting requires a new reveal.
- Reveal pricing is match-quality-tiered and discounts on a 2nd+ reveal against the *same* posting — nudges recruiters toward multi-candidate comparisons per role rather than one-off reveals. **This corrects a standing documentation error**: this section previously described the same-role discount as already implemented; it was not — see §4a for the real mechanism and its current build status.

**Why this design, not a legal lock-in**: an anti-circumvention clause or placement-fee revenue share was rejected — it's a dealbreaker for independent headhunters, who won't give up commission on top of a platform fee (see BUSINESS.md §3/§7). Retention here is earned through product stickiness ("hurdles, not blockers"), not contractual restriction.

## 4a. Recruiter Monetization — Per-Role Budgets, Dynamic Pricing, Ranking Boost (roadmap — not yet built)

**Status**: recorded architecture decision only, same treatment as §2b-§2e. No schema or pricing-engine code exists for any of this yet — see BUSINESS.md §7 for the tier/pricing framing this implements, MEMORY.md for the dated decisions.

- **Per-role spend budget — a governance layer, not a new ledger.** No new currency: the existing single shared `points_ledger` balance (§6) stays the only balance. A `job_postings`-scoped budget is a spend cap the recruiter sets (or accepts a system suggestion for) per posting; Reveal and JD-assist actions against that posting draw from the shared balance but are blocked once the posting's cumulative spend hits its cap.
  - **Hard-cap reservation**: the sum of every open posting's budget can never exceed the recruiter's current unallocated balance — setting or raising a budget checks remaining unallocated balance first, so there's no fail-at-spend-time surprise.
  - **Auto-release on posting close**: when a posting is closed, filled, or expires, its unspent reserved budget releases back to the recruiter's unallocated balance immediately — no stuck/orphaned reservations, no manual release step.
  - **Seniority derivation**: `job_postings` gains no new seniority column; a seniority tier is derived from the (mandatory) `salary_min`/`salary_max` band, not the raw exact figure — this lets the backend price off seniority while `salary_visibility='on_request'` still keeps the exact number private from candidates. Salary itself is mandatory at posting time (only its *sharing* is optional), so there is no true no-salary pricing fallback to design for; showing the recruiter a market-average reference figure at entry time is a reasonable nudge, not a requirement. Verify at implementation time whether `salary_min`/`salary_max` are actually enforced NOT NULL at the DB/form level today — if not, add that constraint as part of this work, not as a separate ask.
  - **Salary-min gaming considered and dismissed**: inflating `salary_min` to buy a higher pricing tier only costs the recruiter their own budget and reduces their own match volume (a narrower salary band naturally returns fewer matches) — self-correcting, not an exploit worth engineering against.

- **Dynamic Reveal pricing (replaces the flat `REVEAL_COST`/`OVERRIDE_COST` constants in `src/lib/points.ts`)**: reveal cost = a per-role base price (from the derived seniority band) × a match-quality multiplier × a same-role volume-discount multiplier. All multipliers are placeholder, env-tunable constants (mirroring the existing `points.ts` pattern), not pinned numbers — sized once real usage data exists. The recruiter-facing match list (`src/app/recruiter/jobs/[id]/matches/match-list.tsx:93`) already surfaces the raw `{score}% match` badge pre-reveal, so a bid-style price signal has something real to bid against.
  - **Design rationale, stated plainly**: this is a deliberate bid/allocation mechanism, not just a price increase. Well-funded recruiters "bid" for top candidates by paying the match-quality premium; budget-conscious recruiters are naturally steered toward revealing less-competitive candidates — including new graduates — who would otherwise rarely get looked at if every recruiter chased the same top-ranked match at flat cost. Trade-off named honestly, not sold as pure upside: a lower-scoring candidate may realistically only ever get revealed by a lower-budget recruiter, never the best-funded one.

- **Recruiter-initiated override reversal** (new action, distinct from the existing candidate-decline/expiry-refund path above): a recruiter can cancel a pending override before the candidate responds. The recruiter's charge is forfeited (not refunded) and paid to the candidate as compensation. **A self-reversed override still counts toward `OVERRIDE_DAILY_CAP` (5/day) and still triggers `OVERRIDE_REBLOCK_DAYS` (30-day block) on that candidate** — it is not exempt from either existing guardrail; otherwise reveal-then-reverse cycling becomes a loophole around them. Flagged in LEGAL_REVIEW.md given the platform's non-monetary, closed-loop points design (see BUSINESS.md §11 for the standing tension this stresses further).

- **Paid AI JD-assistant**: `refineJobText` (`src/app/recruiter/actions.ts:119-126`), free during MVP, becomes a credit-consuming action drawn from the same per-role budget — flat per-use cost, not seniority-scaled (the per-role budget cap is what bounds total spend).

- **Market Intelligence expansion — new dimensions, new dependency (§2e)**: comp/bonus/sales-commission (client-facing roles)/equity trend data joins the existing skill-demand and minimum-base-salary aggregates in `src/lib/market-signals.ts`. **Not a one-line RPC extension**: it requires new seeker-facing structured capture fields — with their own separate opt-in consent, mirroring the existing `market_signals_opt_in_at` pattern — *before* the k-anonymized aggregate RPCs can surface these dimensions. Gated on a data-coverage check (most target segments actually clearing k≥20) before this ships as a priced feature — see BUSINESS.md §7.

- **Job-post ranking boost (enterprise add-on SKU)**: raises a posting's rank in the seeker's match queue. **Must carry a visible "Promoted" label on the seeker-facing card** — sits alongside, and does not conflict with, the match-band-cap privacy invariant (§2d): that invariant governs the match-quality signal shown, this label governs sponsorship disclosure, and both must remain visible on the same card. This is the recruiter-monetization feature most likely to undercut the platform's privacy-first/unbiased-matching positioning if left undisclosed — disclosure is required, not optional.

## 5. Privacy & Security Architecture

**Redaction approach and its limits**: names, employers, and direct contact fields are stripped; quasi-identifiers are generalized. This reduces but does not eliminate re-identification risk — current literature on LLM-agent re-identification attacks and stylistic fingerprinting shows pseudonymized text can, in some cases, be re-linked to an individual, especially in small/niche talent pools. We do not design around a "zero re-identification risk" claim. Mitigations: rate-limited reveals (BOTH paths daily-capped as of 2026-07-28 — `REVEAL_DAILY_CAP` for standard reveals joined the existing override cap; previously this sentence overclaimed), quasi-identifier generalization, no raw-resume access outside the ingest pipeline, plus the Layer-0 deterministic contact-pattern strip (§2f).

**Embedding-inversion threat (added 2026-07-28 — PROBLEM.md Problem 1)**: text embeddings are not one-way — inversion techniques (vec2text, ZSInvert) can reconstruct substantial text from stored vectors, so `skill_vectors.embedding` must be treated as containing whatever the embedded text contained. Existing mitigations, stated as load-bearing invariants: (a) **redaction-before-embedding** — only redacted text + aggregated experience facts are ever embedded (`publishProfile`), so a successful inversion recovers *already-redacted* text, not raw PII — this ordering is what bounds the blast radius and must never be weakened; (b) `skill_vectors` SELECT is owner-only (RLS, 0002) and cross-profile access exists only through the `match_candidates` security-definer RPC, which returns `profile_id, score, redacted_text` — **raw embedding vectors never egress to any client or API response**; (c) reveal rate limits (above) bound systematic-enumeration attacks that could feed auxiliary-data re-identification. **Future hardening (deferred with trigger)**: calibrated noise injection (DP-style) on stored embeddings — same posture as §2e's optional-noise note; not built until the matching-quality cost is measured against real usage, since redact-first already removes the raw-PII payoff an attacker would want.

**Access control**: Supabase RLS as the primary enforcement layer — a seeker's raw resume and unredacted PII are never queryable by a recruiter/enterprise role; only skill vectors and (post-reveal) disclosed fields are.

**Resume-persistence invariant (added for the §2c continuous-maintenance pivot)**: raw resumes are *already* retained owner-only today (the `resumes` table, access-restricted). What the continuous-maintenance pivot actually changes is narrower than "we now keep resumes" — it is: (a) the resume goes from *persisted-but-static* (ingested once) to *continuously updated over the life of the account*, (b) active-account retention lengthens accordingly, and (c) consent scope must now cover ongoing AI maintenance, not just one-time ingest. The posture does **not** degrade (nothing that used to be discarded is now kept); it deepens an already-retained asset. "We maintain your resume" and "privacy-first" coexist only under these explicit rules, which the pivot must not weaken:
- The maintained raw resume stays **owner-only** (RLS, same posture as `resumes` / `skill_vectors` / `seeker_experience`) — recruiters and every other role never see it, before or after any reveal (a reveal discloses name + fit summary and, on separate consent, contact info — never the raw resume).
- The **redaction boundary is unchanged**: only the redacted/generalized skill vector is ever matched, and only k-anonymized aggregates from opt-in profiles (§2e) ever feed the signal product.
- The pivot **expands PII retention** (a live resume is now kept and maintained indefinitely rather than processed once), so the bounded-retention policy (below; BUSINESS.md §11) and the AI-processing consent must explicitly cover *continuous maintenance*, not just one-time ingest. Retention stays bounded-not-indefinite; "maintained indefinitely" describes the active-account lifecycle, not an exemption from the deletion/retention window.

**PDPA/PDPO compliance**:
- SG opco is the primary PDPA-compliant entity; HK opco handles PDPO for HK-based data/users.
- Consent must cover the anonymization/redaction process itself, not just initial data collection.
- Retention: designed to be long but explicitly bounded (not indefinite-by-default) — exact window pending legal review (see BUSINESS.md §11).
- Cross-border transfer: hosting in AWS ap-east-1 (Hong Kong region) is **not sufficient on its own** — pair with a data processing agreement / model contractual clauses per PDPA §26 guidance.
- **Modal region (closed 2026-07-28)**: the Modal apps previously had no `region=` config — implicit US default, meaning raw resume text crossed to US GPUs for redaction with no explicit decision behind it. Both apps are now pinned `region="ap"` (broad APAC, ~1.5× price multiplier accepted — `modal_app/llm.py`/`embeddings.py`). Interim posture until the HK edge-layer migration (§2f); subprocessor DPAs still required either way (LEGAL_REVIEW.md Q16; compliance-ops checklist below).
- **Compliance-ops execution items (decided 2026-07-28; host updated 2026-07-30 after the Vercel migration)** — before private beta: signed subprocessor DPAs (Modal, Supabase, Vercel), subprocessor register + privacy-notice page (`/privacy`, draft-for-counsel), manual DSAR/withdrawal runbook (`docs/DSAR_RUNBOOK.md` — PDPO's 40-day access-request clock binds from the first real user). Account-deletion self-service is **built** (`/account`, cascade + points-ledger sanitization, shipped 2026-07-30 — §12).

## 6. Points/Credits System

- **Closed-loop, non-monetary ledger.** No cash-out, no real-world voucher redemption — this is what keeps it outside SG's Payment Services Act (e-money/SVF licensing) and HK's MSO/SVF licensing regimes. ToS must state points are non-transferable and non-cash-redeemable to preserve this.
- **Earning is gated behind AI-verified quality actions**: skill assessment pass (AI-generated content, human-reviewed before use), verifiable work-history signal — *not* raw profile-field edits, to prevent low-effort farming for free redemptions. **Build state**: a standalone skill-assessment flow is roadmap (`verified_actions` table + `skill_assessment`/`work_history` enums exist; no assessment UI). The one wired `verified_action` earn today is training-program completion (§7a). Reveal-compensation and freshness-confirmation earning are built.
- **Earning also occurs automatically on reveal events** (accepted or declined) — candidates get compensated for being part of the marketplace even when a match doesn't convert.
- **A third earning category, added this revision: freshness confirmation** (§2c) — narrow and rate-limited (not "AI-verified" in the same sense as a skill assessment; see §2c for why that phrasing is deliberately avoided), tied to a genuine suggest-and-approve maintenance update rather than a raw field edit.
- **Redemption catalog**: AI resume rewriting (available at MVP); AI-Credit Marketplace allowance (fast-follow, see §7).
- **Spend side (recruiters)**: Reveal Requests (per-role, match-quality-tiered + same-role multi-candidate discount — §4a), AI JD-assist (§4a), the consent-override path, and its recruiter-initiated reversal (§4a, LEGAL_REVIEW.md).
- **Benefits/loyalty carries no credit currency at all — nothing to wall off from this ledger.** See §7b: tier eligibility is now a concrete per-side cumulative counter (formalized this revision), and the benefit itself is a discount code the user redeems by paying the vendor directly. Since no value is ever purchased, held, or redeemed through Binding for it, it was reframed away from the credit-based/walled-off-rail design this bullet used to describe (superseded 2026-07-21 — see MEMORY.md).
- **A directional, far-roadmap idea — the External Loyalty Partner Bridge (§7d)** — would sit entirely outside this ledger by construction: a partner independently credits its own loyalty currency; nothing here is ever converted or exchanged.

## 7. AI-Credit Marketplace (fast-follow feature — design now, build immediately after MVP)

**Scope narrowed 2026-07-21** (see MEMORY.md): this is no longer a genuinely open, general-purpose API key. The redemption is scoped to **career/JOB-related AI tasks only** — resume rewriting, cover letters, interview prep, career-path guidance, and similar. This narrowing exists specifically to keep the redemption single-purpose (same category as "AI resume rewriting," DESIGN §6), which is what lets this drop from a hard legal blocker to a confirmation-only question for counsel (see below and LEGAL_REVIEW.md).

Why the narrowing was necessary: the original design's own words — "a genuinely open, OpenAI-compatible API key, usable with any third-party agent… not restricted to a Binding-branded skill" — directly contradicted a narrow-redemption defense. Being Binding's own compute doesn't narrow what the user can *do* with an unrestricted key; redemption **breadth**, not who hosts the model, is what a single-purpose exemption turns on. Self-hosting general-purpose, point-anywhere compute is closer to fungible value than a single-purpose facility regardless of provider.

**Enforcement mechanism**: a classifier-gated OpenAI-compatible passthrough — the API key keeps its OpenAI-compatible shape (still usable with agent frameworks like Hermes Agent/OpenClaw), but a moderation/classifier layer at the gateway rejects requests outside the career-task scope. This preserves more of the original differentiator than dedicated single-purpose endpoints would, at a real, acknowledged cost: enforcement is imperfect (adversarially-phrased requests can slip through) and the classifier itself is nontrivial engineering. Exact classifier design is an open question (§11).

**General-purpose AI-infrastructure reselling — explicitly out of scope, not part of this feature.** The original "genuinely open, any third-party agent, point-it-at-anything" idea is a distinct, unscoped future business line, not this pillar. If ever pursued, it needs its own full legal review from scratch (same weight this feature originally carried) — it is not folded into or grandfathered by this narrower feature's confirmation-only status.

Architecture:
- **API gateway/proxy service** issues per-user OpenAI-compatible keys, gated by the career-task classifier above.
- Backed by the **same Modal/Baseten-hosted open-weight models** (Llama 3 / Mistral) already used for matching — reuses existing serverless LLM infra rather than standing up a separate stack.
- **Metering is dollar-value-based per user per period** (mirrors OpenCode Go's model, not raw request counts).
- **Hybrid funding**: a points-funded free allowance continues to exist (same mechanism as before), alongside a new direct-cash top-up/subscription option. Both paths sit within the now-narrowed, single-purpose scope, so neither reopens the breadth concern the fully-open design had.
- **Hard per-period $-cap enforced at the gateway** regardless of funding path — the abuse/cost guardrail, since even a scoped key can still be driven by an agent running unattended loops.
- **Never proxies to premium/frontier models** — open-weight only, to keep the cost model survivable.
- **Allowance tiers**: free seekers get a small points-funded allowance; Pro seekers ($9.99/mo) get a guaranteed larger allowance bundled into the subscription, or can top up with cash.

**Repositioning**: with the scope narrowed, this is now positioned as an **AI career-assistant credit allowance** — a scoped extension of the existing resume-rewriting benefit, not a general-purpose dev-tool differentiator. The OpenCode Go comparison is weaker than before (OpenCode Go's own differentiator is unrestricted general-purpose use, which this feature no longer offers) — still citable as evidence that $-capped AI subscriptions are viable, not as evidence this product matches OpenCode Go's shape.

**Explicitly not MVP**: ships as the first feature immediately after MVP, once real usage data exists to size the $-caps safely. This operational gate is unrelated to licensing and is unaffected by the scope-narrowing above.

**Legal status: confirmation-only, not a hard blocker** (downgraded 2026-07-21 — see MEMORY.md), conditional on the career-task scoping being real and enforced, not just described. Ask counsel to confirm the scoped redemption sits within the same narrow-redemption logic as AI resume rewriting, and what enforcement/verification they'd want to see — see [LEGAL_REVIEW.md](./LEGAL_REVIEW.md). Like the rest of the points system, this falls back to the general private-beta-plus-parallel-legal-review sequencing (BUSINESS.md §11) — engineering can build without waiting on counsel; only real public launch should wait for confirmation to land.

## 7a. Roadmap adjacency — Training / Reskilling (built)

**Status (corrected 2026-07-23)**: live (migration `0010_training.sql`, `src/lib/training.ts`, `/training`, e2e in `e2e/training-benefits.spec.ts`). The credit-bootstrap gap noted below is real and still unresolved, not a leftover roadmap caveat.

AI-driven quiz + guided-learning product (reference point: Gemini Guided Learning). Two tracks delivered simultaneously:
- **Individual career-path programs**: personalized reskilling toward a target role, informed by the gap between the seeker's skill vector and in-demand roles (the same aggregate signals from §2e).
- **Corporate training**: compliance-oriented programs (AML, security) sold to enterprises; an employee can receive individual + corporate training at once.

Reuses the existing serverless open-weight LLM infra (§8) for content generation and the `verified_actions` mechanism — completing a program is an AI-verified action that earns points (§6), tightening the earn-loop. Mission stays hiring-core (VISION.md); this is an adjacency the data moat enables, not a headline feature.

**Training credits — a separate, narrow-redemption instrument** (not points-ledger reuse, distinct from the AI-Credit Marketplace/Benefits mechanics above and below):
- **Three funding sources**: (a) convert existing points into training credits, (b) earn directly by completing quizzes/courses, (c) enterprises purchase credit bundles for staff (mandatory compliance-training seats).
- **One-way only**: points → credits, never back. Credits are a pure sink — no fungibility-back-to-points concern.
- **Segregated balances**: enterprise-assigned seats (compliance-training) never commingle with personal credits (points-converted or quiz-earned) — a corporate compliance seat can't be spent on the employee's own career-path courses, and vice versa.
- Redemption stays narrow: Binding's own training content only — same category as "AI resume rewriting," which is what keeps this out of hard-blocker territory. (An AWS-exam-voucher-style card sometimes shown alongside training content is a zero-cost contextual ad — no credit spend, no referral tracking — and doesn't touch this redemption claim; see §7c.)
- **Legal status: confirmation-only** — see LEGAL_REVIEW.md, which explicitly flags the enterprise cash-purchase path (cash-in → held credit balance → later redemption is the classic prepaid/stored-value trigger pattern; narrow single-purpose redemption is the defense, but counsel should be pointed at this specific funding path).
- Training credit costs and the points→credit conversion rate are not yet numbered (§11) — no placeholder invented ahead of real usage data.

## 7b. Roadmap adjacency — Benefits / Loyalty programme (built; confirmation-only)

**Status (corrected 2026-07-23)**: live (migration `0011_benefit_partners.sql`, `src/lib/benefits.ts`, `/benefits`, e2e in `e2e/training-benefits.spec.ts`). "Confirmation-only" describes legal status (LEGAL_REVIEW.md Q8), not build status.

**Reframed 2026-07-21, replacing the credit-based/walled-off-rail design committed 2026-07-20** (see MEMORY.md, which supersedes that entry).

**No benefit-specific credit currency exists.** Tier eligibility is a **per-side cumulative counter** (formalized this revision, replacing the previous vague "activity/tenure-based" placeholder): **seekers** qualify on cumulative lifetime points **earned** (sum of earn-type `points_ledger` entries — skill assessments, work-history verification, reveal events, freshness confirmation); **recruiters/corporates** — who never earn points in this spend-only economy — qualify on cumulative lifetime points **spent** (sum of debit-type entries: reveals, overrides, JD-assist, ranking boost). Both are monotonic historical sums, never reduced by a current balance running low or by spending points down, so this reconciles "corporates and individuals" (both eligible) with the recruiter side having no earn mechanism, without introducing anything resembling a redeemable balance. This is a query-only addition whenever §7b itself gets built — no schema change, since both sums are already derivable from `points_ledger`. There is nothing to wall off because there is no benefit currency.

**Pure discount-code redirect — no payment nexus.** Binding hands a tier-eligible user a discount code; the user pays the vendor (airline, hotel, IT retailer, healthcare provider, etc.) directly, on the vendor's own payment page. Binding's systems never process, hold, or forward funds for the benefit itself.

**Applies uniformly across all categories** — flights, accommodation, wellness, IT-equipment, healthcare, career advisory are all "tier status unlocks a partner discount code," not a redeemable credit purchase. No category keeps a credit-based mechanic. Long-term ambition: a global loyalty programme, same tier/discount-code shape, cross-jurisdiction.

**Privacy invariant**: this model is only privacy-clean if discount codes stay **generic** (the same code for everyone at a tier) — same pattern as the Training AWS-voucher ad's "no tracking." A personalized/tracked code would reintroduce a data-sharing consent question with the partner vendor.

**Legal status: confirmation-only, not a hard blocker** (downgraded 2026-07-21), conditional on the no-stored-value/no-payment-nexus facts above holding. See LEGAL_REVIEW.md for the confirmation question and the residual risks it must still surface (affiliate/referral disclosure, consumer-protection/advertising rules on discount-claim accuracy, "loyalty programme" branding/jurisdiction rules independent of stored value, the cross-jurisdiction angle). Falls back to the general private-beta-plus-parallel-review sequencing, same as Training and the narrowed AI-Credit Marketplace. Near-term scope is career benefits only; regulated financial benefits (insurance, etc.) are explicitly future-roadmap.

## 7c. Roadmap adjacency — Contextual advertising (later-stage; not yet built)

Ads, if introduced, are **contextual only — no behavioral or individual-level tracking**. Targeted by page context (role/skill/surface shown), never by profiling an individual across their data or via cross-site pixels. No PII is exposed to advertisers. Any cohort-level targeting would reuse the §2e k-anonymity threshold and require its own consent posture (LEGAL_REVIEW.md). This keeps advertising consistent with the privacy-first moat rather than in tension with it.

## 7d. Roadmap adjacency — External Loyalty Partner Bridge (far roadmap; not an active initiative, no partner outreach yet)

**Origin and correction**: prompted by researching how OpenRice's Asia Miles integration works, as a candidate model. OpenRice does **not** convert its own points into Asia Miles — the two are separate ledgers, never transferred either way (per OpenRice's own FAQ). What actually happens is **dual-crediting**: Cathay Pacific independently credits its own Asia Miles for qualifying actions on OpenRice's platform, while OpenRice's own point ledger is untouched. This design follows that shape, not a conversion shape.

**Mechanism**: a partner (e.g. an airline or hotel loyalty programme) independently awards its own currency for a qualifying event. **Binding's points ledger is never debited, converted, or exchanged** — there is no exchange rate between Binding points and any partner currency, ever. Applies to both seekers and recruiters, and is deliberately **independent of Benefits/Loyalty tier** (§7b) — it triggers off the qualifying event itself, not off reaching a tier.

**Two trigger tiers, kept in separate legal buckets (see LEGAL_REVIEW.md — this distinction matters and is easy to blur back together when editing)**:
- **Near-term concept**: a subscription-based bonus — Pro seekers and paid recruiter tiers earn partner miles on each renewed subscription period. This is a **retention sweetener on a payment already being made**, structurally closer to a card-rewards pattern (miles-for-cash-spend) than to a loyalty-activity exemption — it must not be described as resolving the recruiter earn-loop gap named in BUSINESS.md §6a, and must not be described as covered by the activity-based research below.
- **Future, infrastructure-gated**: activity-based crediting (a successful placement, a reveal-accept) — deferred until end-to-end placement-outcome tracking exists, which it does not today (the same gap flagged for the recruiter-monetization pricing-ceiling heuristic). Not to be implied as buildable now.

**Privacy**: partner data sharing (name, email, or a partner-loyalty-account number) requires a new, explicit, separate opt-in consent — same shape as the market-signals/comp-data consents (§2e; off by default, its own plain-language explainer) — and, for a cross-border partner, rides the existing cross-border PDPA/PDPO transfer posture (BUSINESS.md §11), not just a UI consent toggle.

**Legal status: not yet reviewed, no active initiative.** See LEGAL_REVIEW.md for the two separate confirmation items this needs before any real partner agreement.

## 8. AI/LLM Strategy

- **MVP**: base open-weight models (Llama 3 / Mistral) + prompt engineering + region-specific retrieval (RAG) for HK/SG hiring context. This gets most of the matching-quality value at a fraction of the cost/time of fine-tuning.
- **Fine-tuning (Cantonese/Singlish NLP)**: explicitly deferred to Month 12+. Compute cost is trivial (~$1-5 per training run), but corpus curation — sourcing/labeling a quality Cantonese/Singlish hiring dataset — is the real cost (~$5-15K, 3-6 months) and isn't worth front-loading before product-market fit.
- **Skill assessments**: AI-generated, human-reviewed before use.

## 9. Scaling Notes

- **pgvector is the right choice at MVP and well beyond** — suitable up to roughly 10M vectors at expected query rates. Don't pre-migrate to a dedicated vector DB (Pinecone/Qdrant) until p99 query load exceeds ~50 req/sec or advanced filtering needs outgrow pgvector — premature migration adds cost and complexity with no near-term benefit.
- **Serverless LLM cost guardrail**: the $2,500/mo infra budget (BUSINESS.md §10) is realistic for matching-pipeline inference alone if volume stays controlled; the AI-Credit Marketplace introduces a separate, variable cost line once it ships and needs its own monitored budget/cap, not folded into the matching-pipeline number.

## 10. Revenue/Entitlement Logic

- **Independent headhunters/agencies**: fee-for-access only — reveal fees + Pro subscription. No success/placement fee enforced anywhere in the data model for this segment (a deliberate call; see BUSINESS.md §7).
- **Enterprise tier**: includes a tiered commission entitlement (lower % entry-level placements, higher % executive placements), offsettable via a higher platform-fee tier, plus job-listing priority, and now also the Advanced tier's Market Intelligence + ranking-boost SKU as included capabilities (§4a, BUSINESS.md §7). This model is explicitly evolving — implement the mechanism (a commission-percentage field per placement, tied to a role-seniority tag) without hard-coding final percentages.
- **Recruiter monetization pricing ceiling** (BUSINESS.md §7): the ~20%-of-commission design guideline has no enforcement mechanism today — Binding doesn't track placements or commission amounts. It calibrates suggested per-role budget defaults (§4a) only; treat as a heuristic, not a constraint the entitlement logic checks against.

## 11. Open Questions

- Exact data-retention window (pending legal review — see BUSINESS.md §11).
- Exact enterprise commission percentages (pending further business-side brainstorming).
- Exact $-cap sizing for free vs. Pro AI-Credit Marketplace allowances — needs real cost modeling from early usage before the fast-follow ships.
- AI-Credit Marketplace career-task classifier design (exact scope-enforcement mechanism, §7) — deferred to build time.
- Training credit costs per course and the points→credit conversion rate (§7a) — no placeholder invented ahead of real usage data.
- Market Intelligence pricing (§2e) — deferred/roadmap-only, same philosophy as the AI-Credit Marketplace $-caps.
- Recruiter reveal-pricing multipliers (match-quality tiers, same-role volume discount, JD-assist flat cost — §4a) — no placeholder invented ahead of real usage data.
- Recruiter-monetization tier naming ("Solo"/"Advanced" are working names, §4a/BUSINESS.md §7) — confirm during drafting/launch, not load-bearing to the mechanics.
- Whether `job_postings.salary_min`/`salary_max` are actually enforced NOT NULL today, given salary is meant to be mandatory at posting time (§4a) — verify at implementation time.
- Placement-outcome tracking (recruiter marks a hire, optionally logs commission, §4a/§10) — long-range backlog only, contingent on a future decision to expand into hiring-process support; not scoped by anything above.
- Nonce-CSP via edge middleware (before public launch — §2f Layer 0): per-route CSP headers don't survive App Router client-side navigation; the enforceable slice today is the zero-third-party e2e assertion.
- Edge/core physicalization design details (§2f): regional-store topology (per-region Supabase project vs. self-hosted), cross-layer reveal API auth, and the HK-GPU serving stack — deferred until a promotion trigger fires.

## 12. MVP Implementation Notes (2026-07-17 — what's actually built)

The walking skeleton is live in this repo (see README.md for commands). Where
the MVP diverges from the sections above, the MVP choice is recorded here; the
sections above remain the target architecture.

- **Hosting**: Vercel (Hobby tier) for frontend, Supabase (free tier) for
  backend, Modal (Starter plan, $30/mo credit) for private AI inference.
  Previously on Cloudflare Workers but migrated for simpler DX during
  staging/prototype phase.
- **AI serving**: Modal Starter plan ($30/mo recurring credit), not
  pay-as-you-go Modal/Baseten. Models updated after a build-time landscape
  re-check: **Qwen3 8B** (generation) + **Qwen3-Embedding-0.6B** (1024-dim
  embeddings) replace the design-time Llama 3.1/BGE-M3 picks. A deterministic
  **stub provider** is the dev/CI default (`AI_PROVIDER=stub`) — zero network,
  zero cost, fully testable slice.
- **DB keepalive**: GitHub Actions cron (`.github/workflows/keepalive.yml`)
  pings `/api/health` every 3 days — Supabase free tier pauses projects after
  7 days of DB inactivity.
- **Skeleton scope shipped**: full schema + RLS up front; ingest (PDF via
  unpdf + paste-text) → redact → embed → `match_candidates` RPC (cosine +
  dealbreaker filter) → double-opt-in → standard reveal (points debit +
  candidate compensation) → in-app messaging. Profile management
  (draft/publish, visibility + override toggles) and job management
  (draft/active/closed, re-embed on republish) with suggest-and-approve AI
  refinement on both sides, free during MVP.
- **Shipped 2026-07-17 (second pass)**: override reveal flow with guardrails
  (§4), dual-role registration + guided onboarding with consent capture (§2a),
  sign-out, match-refresh-on-publish, company identity on jobs/threads.
- **Shipped since (2026-07-20 → 2026-08-04)** — the §12 header above dates the
  original skeleton; built since then: resume-first onboarding + continuous
  AI-maintenance nudge loop with freshness-confirmation earning (§2c);
  adaptive state-driven `/seeker` dashboard (§2d); aggregate market-intelligence
  (§2e, **location + seniority signals only**); Training (§7a) and Benefits
  (§7b) adjacencies; granular 3-way consent (migration 0016, §2a); Layer-0 PII
  controls + `pii_access_log` + Modal `region="ap"` pin (§2f/§5); standard-reveal
  daily cap (§4/§5); account-deletion self-service at `/account` (§11); staging
  E2E pipeline + auth gate. Migrations now run through `0017_pii_access_log.sql`.
- **Deferred / roadmap** (tables/enums or scaffolding may exist, no working
  path): billing / point purchases ("top-ups coming soon" path), standalone
  skill-assessment earning (only training-completion emits `verified_action`),
  interview-scheduling UI, §4a recruiter monetization (per-role budgets,
  dynamic reveal pricing — costs still flat, override reversal, paid JD-assist),
  §2b external job-supply pipeline, comp/bonus/commission/equity market
  dimensions, job-post ranking boost, enterprise entitlements/ATS/commission,
  company verification, email notifications (Resend), AI-Credit Marketplace
  (§7). No payment processor is integrated — all priced tiers are pre-revenue.
- **Placeholder economics** (constants in `src/lib/points.ts`): recruiter
  seed 100 / reveal 10 / compensation 3 / seeker seed 10. Matching constants:
  top-20, cosine ≥ 0.55, both env-tunable.
- **Email**: Supabase built-in sender (Inbucket locally). Swap to Resend SMTP
  (free 100/day) in the Supabase dashboard before real beta invites.
- **Privacy rule enforcement**: the frontier-API boundary is implemented as
  the `JDTextOnly` branded type (`src/lib/ai/types.ts`) plus
  `tests/frontier-guardrail.test.ts`, which fails typecheck if the boundary
  is weakened.

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-17 | Initial architecture (data model, matching pipeline, reveal mechanics, privacy, points, AI-Credit Marketplace, LLM strategy). |
| 1.1 | 2026-07-17 | §12 MVP implementation notes added (Cloudflare hosting, Modal Starter, Qwen3 models, stub provider, keepalive). |
| 1.2 | 2026-07-17 | §2a Registration & Roles (dual-role opt-in, consent capture, company identity, self-match exclusion); §4 override economics + guardrails confirmed and implemented. |
| 1.3 | 2026-07-18 | Signup/sign-in split on landing (dedicated /signup, env-gated password login, intent-wins redirect rule); points_ledger PK to uuid. |
| 1.4 | 2026-07-18 | §2b External Job Supply & Cold-Start Strategy (roadmap, not yet built): Indeed-scraping rejected, Google-for-Jobs-as-justification rejected, two-stage consent-gated ATS/schema.org pipeline adopted, candidate-paste (text-first) reverse-match, launch-readiness gate. |
| 1.5 | 2026-07-20 | Resume-first pivot + data-monetization roadmap (all not yet built): §2c resume-first onboarding & continuous AI maintenance (suggest-and-approve, AI-never-fabricates, all-triggers loop, consent-before-processing), §2d adaptive-not-generative UI, §2e k-anonymized opt-in aggregate-signal pipeline; §5 resume-persistence invariant (owner-only, unchanged redaction boundary, expanded-retention consent); §6 benefits/loyalty on a separate walled-off credit rail; §7a Training, §7b Benefits/loyalty (hard blocker), §7c contextual-only ads. Mission stays hiring-core. |
| 1.6 | 2026-07-21 | Reconciled new Claude Design mockups against strategy — two reframes, both replacing prior committed text: §7 AI-Credit Marketplace scope-narrowed to career/JOB-related tasks only (classifier-gated passthrough), general AI-infrastructure reselling hived off as a separate out-of-scope future line, downgraded to confirmation-only; §7b Benefits/Loyalty replaced entirely with a discount-code/no-payment-nexus model (activity/tenure-based tiers, no credit currency), also confirmation-only. §7a Training gains an explicit credit instrument (one-way, segregated balances, confirmation-only). §2d gains the match-band-cap invariant (must stay invisible across every dashboard frame). §6 and §12 updated to match — zero hard blockers remain in the docs. |
| 1.7 | 2026-07-22 | New §4a Recruiter Monetization (roadmap): per-role spend budget as a governance layer on the existing single `points_ledger` (hard-cap reservation across postings, auto-release on posting close, seniority derived from mandatory-but-privacy-visible salary bands); dynamic match-quality-tiered + same-role-discounted reveal pricing as a deliberate bid/allocation mechanism (trade-off named explicitly), replacing flat `REVEAL_COST`/`OVERRIDE_COST`; recruiter-initiated override reversal (counts toward the existing daily cap/30-day block); paid AI JD-assistant; Market Intelligence gains comp/bonus/commission/equity dimensions (new seeker capture + consent dependency, gated on data-coverage); enterprise ranking-boost SKU with a mandatory seeker-facing "Promoted" label. §4/§7 corrected — the "same-role 2nd+ reveal discount" was previously described as already implemented; confirmed by code read that it was not. §2d gains the ranking-boost disclosure note alongside the existing match-band-cap invariant. §6/§10/§11 updated to match. |
| 1.8 | 2026-07-23 | §2c gains a new "freshness confirmation" points-earning category (rate-limited, tied to a real suggest-and-approve maintenance update — deliberately not described as "AI-verified"), closing the gap where the platform's core freshness/stickiness mechanic earned no points. §6 updated to list it. §7b's Benefits/Loyalty tier-eligibility formula replaced: from vague "activity/tenure-based" to a concrete per-side cumulative counter (seekers: lifetime points earned; recruiters/corporates: lifetime points spent) — reconciles the "corporates and individuals" promise with the recruiter spend-only economy without introducing a redeemable balance. New §7d External Loyalty Partner Bridge (far roadmap, no active partner): dual-crediting model, corrected from an initial assumption that OpenRice converts points into Asia Miles (it does not — dual-credits only); documents two trigger tiers in separate legal buckets (near-term subscription-based bonus vs. future infra-gated activity-based crediting), with the subscription trigger explicitly flagged as not covered by the activity-based HK/SG loyalty-exemption research. See BUSINESS.md §6a for the cross-side flywheel framing this pass is part of. Also corrected stale "not yet built" headers on §2c/§2d/§2e/§7a/§7b discovered while wiring the above — all five are actually live in code (migrations 0009-0012, `/seeker/nudge`, `/training`, `/benefits`, `/recruiter/market-intelligence`), unrelated to this pass's own changes but caught in the same review. |
| 1.9 | 2026-07-26 | Strict-mockup adherence pass (founder directive: the Claude Design mockup is the authoritative UIUX). Theme reverted to the mockup's monochrome tokens (purple accent + Newsreader serif heading font removed, jb-lift/jb-fade micro-interactions dropped). App shell rebuilt to the NavShell template: 236px collapsed-by-default rail, all-live nav (Pipeline/Candidates/Team-training placeholders removed), inline mode switcher with disabled Enterprise tab, alerts strip + AI-suggestion chip + points chip header, back-to-top FAB. All 15 screen templates implemented; path-segment routing only (no query params — /seeker/matches replaces ?view=matches; new /seeker/points, /seeker/profile/resume; /recruiter is a new aggregate candidate-pipeline dashboard, postings list moved to /recruiter/jobs). Reconciliation rules recorded in CLAUDE.md: shell wins chrome / templates win content; legal-privacy controls survive redesigns; invariants cap literal adherence (band-only seeker scores, k-anonymity, reveal economics). Recruiter onboarding became a 3-step wizard (account+ToS → company details → first-job hand-off). |
| 1.10 | 2026-07-28 | Migrated from Cloudflare Workers to Vercel (staging). Removed `@opennextjs/cloudflare`, `wrangler.jsonc`, `open-next.config.ts`. Added GitHub Codespace dev environment, GitHub Actions CI/CD, and staging deployment pipeline. Hosting split: Vercel (frontend) + Supabase (backend) + Modal (private AI). |
| 2.0 | 2026-07-28 | PROBLEM.md remediation + layered privacy architecture (founder-grilled across 8 rounds, twice advisor-reviewed). New §2f: Edge/Core target architecture ("Privacy at the edge, Security at the core" — hybrid per-jurisdiction B2C edge + customer-VPC B2B edge, SG core, phased path with promotion triggers, vectors-leave/raw-stays VPC boundary), ZK-FL rejected-with-reasoning after adversarial deep-research (claimed benchmarks unsupported; AI Verify/Moonshot are governance toolkits, not crypto certs), four-layer controls matrix (Layer 0 client / 1 edge / 2 core / 3 internal masked+break-glass+TA-firewall). §2a/§2c: consent split three ways (processing + profiling required, maintenance optional/withdrawable with JIT prompt + settings toggle — migration 0016), PDPA Accuracy-Obligation posture named. §5: embedding-inversion threat model (redact-before-embed as load-bearing invariant, DP-noise deferred-with-trigger), standard-reveal daily cap closing the "rate-limited reveals" overclaim, Modal region pinned `ap` (was implicit US), compliance-ops checklist (DPAs, `/privacy` page, DSAR runbook). New `pii_access_log` (0017, cross-party only, Layer-3-ready). Layer-0 code: pii-patterns strip (paste-path client-side, PDF-path at ingest), PDF Info+XMP metadata strip, path-honest preview copy, zero-third-party e2e. See BUSINESS.md §10a for the grant ladder this pairs with. |
| 2.1 | 2026-07-30 | Post-Vercel-migration doc sync (PR #4 moved hosting Cloudflare Workers → Vercel on 2026-07-29 but left stale references): §5 compliance-ops subprocessor DPA list now names Vercel instead of Cloudflare (matching the `/privacy` register, updated in the same pass); CLAUDE.md's broken `DEVELOPMENT.md` pointer redirected to `AGENTS.md` (the file was never created). No architectural change — hosting substitution only; the middleware.ts note and §12 hosting entry were already corrected by PR #4 itself. |
| 2.2 | 2026-07-30 | Staging E2E pipeline + security hardening + account deletion. Middleware auth gate (basic auth + `x-staging-auth` shared secret, defense-in-depth, only activates when env vars set — invisible in local dev). Account deletion at `/account` (server action: Supabase Storage cleanup, points ledger sanitization, soft-close recruiter job postings, cascade via `auth.users`, confirmation email, sign-out). 17 functional pass/fail E2E tests against hosted staging (auth, matching pipeline, reveal mechanics, privacy Layer-0, routing/UIUX, account lifecycle, staleness nudge, in-app messaging). 7 UAT rubric scenarios with evidence capture — scored by OpenCode GitHub action with dual-agent consensus via `.opencode/agent/uat-scorer.md` subagent. Nightly cron (3am UTC) → wait-for-deploy → Modal warm-up → functional suite → UAT evidence → OpenCode scoring → issue on failure. Weekly cleanup (Sunday 4am UTC) deletes stale test users > 24h via cleanup workflow. All credentials stored as GH Actions encrypted secrets, never in code. Supabase storage buckets `staging-test-evidence` + `staging-test-scores` for evidence retention (keep 3 runs). |
| 2.3 | 2026-08-03 | Brand rename JumpOnBoard → Binding (public brand; JumpOnBoard retired as internal code name). Domain strategy `binding.hk` (corrected to `getbinding.com` in 2.4). No architectural change — naming substitution in narrative text only; technical identifiers unchanged at the time (`@jumponboard/ui` later renamed `@binding/ui`, Vercel project/staging-URL/docker-stack-name unchanged). |
| 2.4 | 2026-08-04 | **Demo-readiness reconciliation pass** (investor/CCMF-demo milestone; companion to BUSINESS.md 2.1). Corrected doc-vs-code drift so every "built" claim matches the codebase: §12 gains a "Shipped since" block + an honest deferred/roadmap list (billing/skill-assessment/interview-scheduling/§4a-monetization/§2b-supply/ranking-boost/enterprise all roadmap; no payment processor); interview scheduling downgraded from a listed component to roadmap (§1/§8 — table only); account-deletion removed from the §5/§2f/§11 pending lists (it is built); skill-assessment earning marked roadmap in §6. Modal endpoint verified down (needs redeploy for the demo). Revision history reordered (1.9/1.10 were below 2.x; 2.0-2.3 were in reverse order). Domain `binding.hk` → `getbinding.com` reflected in BUSINESS/`/privacy`/DSAR. |
