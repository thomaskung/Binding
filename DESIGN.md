# DESIGN.md — JumpOnBoard (J.O.B.) Technical Architecture

**Version 1.6** · Last updated 2026-07-21 · Revision history at the end of this document.

Companion to [BUSINESS.md](./BUSINESS.md) (strategy/pitch) and [VISION.md](./VISION.md) (goals/metrics). This document describes how the product is actually built. Status: walking-skeleton MVP implemented (see §12 for what's built vs. deferred and where the MVP diverges from the target architecture below).

## 1. System Overview

Solo-founder, AI-assisted ("vibe coding") build. Architecture favors managed services and low operational overhead over anything requiring dedicated ops/on-call.

Components:
- **Frontend**: Next.js (React) web app — candidate/recruiter/enterprise portals, in-app messaging, interview scheduling.
- **Backend**: Supabase (Postgres) hosted in AWS ap-east-1, with pgvector for embedding similarity search and Row Level Security (RLS) as the primary access-control layer.
- **Matching/AI service**: serverless LLM inference (Modal or Baseten, open-weight models — Llama 3 / Mistral) for resume redaction, embedding generation, and skill assessment content.
- **Points ledger service**: closed-loop, non-monetary credit system (earning, spending, refunds, reveal compensation).
- **Messaging & scheduling service**: in-app only — this is a retention mechanic, not a convenience feature (see §4).
- **AI-Credit Marketplace gateway** (fast-follow, post-MVP): API proxy issuing OpenAI-compatible keys, metered against points balance.

## 2a. Registration & Roles (added 2026-07-17)

- **Dual-role accounts, both opt-in**: one account can hold seeker and/or recruiter roles (`profiles.is_seeker` / `is_recruiter`), activated independently. Header switcher when both are held; opt-in CTA for the missing role. `/` routes to the last-used role (cookie), defaulting to seeker.
- **Seeker activation** — guided wizard: (1) name + ToS + explicit AI-processing consent (mandatory — PDPA/PDPO §5 requires consent covering the redaction process itself; timestamps + `consent_version` stored for future re-consent), (2) resume + redaction preview, (3) dealbreakers → publish. Steps 2-3 skippable; dashboard shows a finish-profile banner until published.
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

## 2c. Resume-First Onboarding & Continuous AI Maintenance (strategy/roadmap — not yet built)

**Status**: recorded architecture decision only, same treatment as §2b and §7. No schema or UI beyond the existing ingest/onboarding wizard exists for this yet.

**The problem it solves**: traditional profile-maintenance UI puts the upkeep burden on the user. Free-tier users won't spend time keeping a profile current, so they update only when actively job-hunting — which is exactly when their data is *least* useful to the passive dark pool. Stale profiles starve the recruiter side (the supply-side liquidity problem in VISION.md) and force recruiters back to "please send me your latest resume," reintroducing the friction the product exists to remove.

**The pivot**: make **resume submission the front door**, and have an AI agent **continuously maintain** the resume so the user never has to hand-edit fields. JumpOnBoard becomes the user's de-facto lifelong resume maintainer — a retention/stickiness moat, and the mechanism that keeps the dark pool's data fresh by construction.

- **Consent-before-processing ordering constraint (non-negotiable)**: PDPA/PDPO §5-style consent covering the AI redaction/processing step must be captured *before* the resume is ingested. "Resume-first" therefore means resume upload is the *first substantive step* after a minimal consent gate — never literally before consent. The existing seeker wizard (§2a: name + ToS + AI-processing consent → resume → dealbreakers) is re-sequenced, not bypassed: the consent gate stays first, resume moves up to be the primary action, dealbreakers follow.
- **AI extracts, user approves**: on upload, the AI parses the resume and drafts structured fields (skills, desired roles, industries, `seeker_experience` entries) into the existing structured layer via **suggest-and-approve** — the same pattern already used for resume/JD refinement. The resume becomes the source of truth; structured fields are AI-derived-then-user-confirmed.
- **AI-never-fabricates invariant**: the maintenance agent only restructures, rephrases, or files facts the user explicitly supplied (via the resume or a maintenance answer). It never infers, embellishes, or invents accomplishments, titles, or dates. This is a fairness/integrity guardrail consistent with the tenure-not-employer-prestige stance already encoded in `src/lib/experience.ts` — a fabricated accomplishment could drive a match and be disclosed to a recruiter on reveal, so the guardrail is load-bearing, not cosmetic.
- **Maintenance-loop triggers** (all of them, phased):
  - *Lazy-on-login + staleness check (MVP path)*: on login, if the profile is stale (past a freshness window, or a tenure milestone has elapsed since last update), surface a maintenance nudge ("Still at Company X? Anything new since <date>?"). No cron — consistent with the existing lazy-evaluation pattern used for override expiry (§4).
  - *User-initiated*: an always-available "update my profile" entry point.
  - *Scheduled / email reminders (deferred)*: proactive time-based nudges independent of login. Needs the Resend SMTP swap (§12) plus a scheduler the design has so far deliberately avoided — documented as a later-stage addition, not MVP.
- **Manual entry stays as a fallback**, never removed: users without a resume, career-changers, and anyone who prefers direct editing must still be able to build/edit the structured layer by hand. Resume-first is the default path, not the only one.

**Privacy consequence — the invariant this whole pivot hinges on**: raw resumes are already retained owner-only today; continuous maintenance changes the raw resume from a *persisted-but-static input* into a *continuously-updated, longer-retained, PII-bearing asset* (a deepening of an existing asset, not a new retention of something previously discarded). See §5 for the owner-only / unchanged-redaction-boundary / expanded-retention-consent invariant that keeps "we maintain your resume" and "privacy-first" from contradicting each other.

## 2d. Adaptive UI (state-driven, not generative) (strategy/roadmap — not yet built)

The founder asked whether the UI should become generative — changing according to profile, preference, and resume. Decision: **adaptive/state-driven UI, not runtime-generative UI.**

- **What we build**: deterministic components; a **profile-state machine** decides *which modules surface and in what priority*; AI generates *content* (nudge copy, suggested edits, summaries) inside fixed, testable slots — never markup at render time.
- **State axes**: completeness (draft / published), freshness (fresh / stale by last-update or tenure-milestone), intent (active vs passive looker), role (seeker / recruiter / dual). Example mappings: incomplete → finish-profile flow forward; passive + stale → maintenance nudge forward; active seeker → matches forward; dual-role → role-appropriate surface via the existing switcher.
- **Why not runtime-generative** (considered and rejected): an LLM emitting UI markup per render is (a) not deterministically testable, which breaks the standing unit+e2e convention (CLAUDE.md); (b) expensive per render; (c) an accessibility and injection-surface risk (untrusted markup rendered into the app). Adaptive-with-AI-content-in-fixed-slots captures ~90% of the intent while staying green under Playwright.
- **Match-band-cap invariant (added 2026-07-21)**: any adaptive-dashboard state that renders a match card must reflect the already-shipped `seeker_tier` cap (`matchBand()`, `src/lib/matching.ts` — `high` caps to `normal` unless `seeker_tier='pro'`), with **no differential signal** for a capped match — it must be fully indistinguishable from a genuine `normal` match, across every frame/state that shows matches (a dual-role frame is not exempt just because it also shows a recruiter view). A true, uncapped `high` state may only ever appear in a separately, explicitly-labeled Pro-tier frame. This guards against UI work silently reintroducing the privacy leak a first draft of the adaptive dashboard mockup had.

## 2e. Aggregate Signal Pipeline — privacy-preserving monetization (strategy/roadmap — not yet built)

The data JumpOnBoard collects (fresh, structured, continuously-maintained career data) is a monetizable asset **only in aggregate, non-identifiable form**. PII is never sold or shared. This is a data-collection business *within* privacy-first, not a departure from it (see BUSINESS.md §3/§7).

- **Opt-in, separate consent**: a profile feeds the aggregate-signal product only after the user gives a **separate** opt-in consent, distinct from the AI-processing consent (extend the `src/lib/consent.ts` / `CONSENT_VERSION` mechanism). Privacy stays the default.
- **Hard k-anonymity threshold**: no aggregate signal (e.g. "expected salary raise for Rust engineers in SG," "in-demand skills in HK fintech," hiring velocity) is ever computed, surfaced, or sold unless the underlying cohort is **≥ k distinct opted-in people** (starting target **k≥20**, exact value pending counsel — see LEGAL_REVIEW.md). Below threshold the signal is **suppressed entirely**, not approximated. In small/niche APAC verticals this is what actually makes "non-identifiable" true (§5 flags small pools as the re-identification danger) and is the basis for arguing the aggregates fall outside PDPA/PDPO "personal data" scope.
- **Optional noise (future)**: differential-privacy-style noise on published figures is a documented future hardening, not required for the first version once k-thresholding is in place.
- **Outputs are aggregate-only**: the signal product never exposes, ranks, or links an individual profile. It reads from opted-in, k-thresholded cohorts and emits statistics.
- **Invariants unchanged**: only the redacted/generalized skill vector is ever matched (§3), and only k-anonymized aggregates from opt-in profiles ever leave for the signal product. The frontier-guardrail invariant (`JDTextOnly`, `tests/frontier-guardrail.test.ts`) still holds.

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
- Revealing a 2nd+ candidate against the *same* posting is discounted — nudges recruiters toward multi-candidate comparisons per role rather than one-off reveals, which increases average revenue per posting.

**Why this design, not a legal lock-in**: an anti-circumvention clause or placement-fee revenue share was rejected — it's a dealbreaker for independent headhunters, who won't give up commission on top of a platform fee (see BUSINESS.md §3/§7). Retention here is earned through product stickiness ("hurdles, not blockers"), not contractual restriction.

## 5. Privacy & Security Architecture

**Redaction approach and its limits**: names, employers, and direct contact fields are stripped; quasi-identifiers are generalized. This reduces but does not eliminate re-identification risk — current literature on LLM-agent re-identification attacks and stylistic fingerprinting shows pseudonymized text can, in some cases, be re-linked to an individual, especially in small/niche talent pools. We do not design around a "zero re-identification risk" claim. Mitigations: rate-limited reveals, quasi-identifier generalization, no raw-resume access outside the ingest pipeline.

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

## 6. Points/Credits System

- **Closed-loop, non-monetary ledger.** No cash-out, no real-world voucher redemption — this is what keeps it outside SG's Payment Services Act (e-money/SVF licensing) and HK's MSO/SVF licensing regimes. ToS must state points are non-transferable and non-cash-redeemable to preserve this.
- **Earning is gated behind AI-verified quality actions**: skill assessment pass (AI-generated content, human-reviewed before use), verifiable work-history signal — *not* raw profile-field edits, to prevent low-effort farming for free redemptions.
- **Earning also occurs automatically on reveal events** (accepted or declined) — candidates get compensated for being part of the marketplace even when a match doesn't convert.
- **Redemption catalog**: AI resume rewriting (available at MVP); AI-Credit Marketplace allowance (fast-follow, see §7).
- **Spend side (recruiters)**: Reveal Requests (per-role, same-role multi-candidate discount) and the consent-override path.
- **Benefits/loyalty carries no credit currency at all — nothing to wall off from this ledger.** See §7b: tier eligibility is activity/tenure-based, and the benefit itself is a discount code the user redeems by paying the vendor directly. Since no value is ever purchased, held, or redeemed through JumpOnBoard for it, it was reframed away from the credit-based/walled-off-rail design this bullet used to describe (superseded 2026-07-21 — see MEMORY.md).

## 7. AI-Credit Marketplace (fast-follow feature — design now, build immediately after MVP)

**Scope narrowed 2026-07-21** (see MEMORY.md): this is no longer a genuinely open, general-purpose API key. The redemption is scoped to **career/JOB-related AI tasks only** — resume rewriting, cover letters, interview prep, career-path guidance, and similar. This narrowing exists specifically to keep the redemption single-purpose (same category as "AI resume rewriting," DESIGN §6), which is what lets this drop from a hard legal blocker to a confirmation-only question for counsel (see below and LEGAL_REVIEW.md).

Why the narrowing was necessary: the original design's own words — "a genuinely open, OpenAI-compatible API key, usable with any third-party agent… not restricted to a JumpOnBoard-branded skill" — directly contradicted a narrow-redemption defense. Being JumpOnBoard's own compute doesn't narrow what the user can *do* with an unrestricted key; redemption **breadth**, not who hosts the model, is what a single-purpose exemption turns on. Self-hosting general-purpose, point-anywhere compute is closer to fungible value than a single-purpose facility regardless of provider.

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

## 7a. Roadmap adjacency — Training / Reskilling (design later, not yet built)

AI-driven quiz + guided-learning product (reference point: Gemini Guided Learning). Two tracks delivered simultaneously:
- **Individual career-path programs**: personalized reskilling toward a target role, informed by the gap between the seeker's skill vector and in-demand roles (the same aggregate signals from §2e).
- **Corporate training**: compliance-oriented programs (AML, security) sold to enterprises; an employee can receive individual + corporate training at once.

Reuses the existing serverless open-weight LLM infra (§8) for content generation and the `verified_actions` mechanism — completing a program is an AI-verified action that earns points (§6), tightening the earn-loop. Mission stays hiring-core (VISION.md); this is an adjacency the data moat enables, not a headline feature.

**Training credits — a separate, narrow-redemption instrument** (not points-ledger reuse, distinct from the AI-Credit Marketplace/Benefits mechanics above and below):
- **Three funding sources**: (a) convert existing points into training credits, (b) earn directly by completing quizzes/courses, (c) enterprises purchase credit bundles for staff (mandatory compliance-training seats).
- **One-way only**: points → credits, never back. Credits are a pure sink — no fungibility-back-to-points concern.
- **Segregated balances**: enterprise-assigned seats (compliance-training) never commingle with personal credits (points-converted or quiz-earned) — a corporate compliance seat can't be spent on the employee's own career-path courses, and vice versa.
- Redemption stays narrow: JumpOnBoard's own training content only — same category as "AI resume rewriting," which is what keeps this out of hard-blocker territory. (An AWS-exam-voucher-style card sometimes shown alongside training content is a zero-cost contextual ad — no credit spend, no referral tracking — and doesn't touch this redemption claim; see §7c.)
- **Legal status: confirmation-only** — see LEGAL_REVIEW.md, which explicitly flags the enterprise cash-purchase path (cash-in → held credit balance → later redemption is the classic prepaid/stored-value trigger pattern; narrow single-purpose redemption is the defense, but counsel should be pointed at this specific funding path).
- Training credit costs and the points→credit conversion rate are not yet numbered (§11) — no placeholder invented ahead of real usage data.

## 7b. Roadmap adjacency — Benefits / Loyalty programme (confirmation-only; not yet built)

**Reframed 2026-07-21, replacing the credit-based/walled-off-rail design committed 2026-07-20** (see MEMORY.md, which supersedes that entry).

**No benefit-specific credit currency exists.** Tier eligibility is **activity/tenure-based** — mirrors the existing points-earning pattern (engagement over time), not a purchased or held balance. There is nothing to wall off because there is no benefit currency.

**Pure discount-code redirect — no payment nexus.** JumpOnBoard hands a tier-eligible user a discount code; the user pays the vendor (airline, hotel, IT retailer, healthcare provider, etc.) directly, on the vendor's own payment page. JumpOnBoard's systems never process, hold, or forward funds for the benefit itself.

**Applies uniformly across all categories** — flights, accommodation, wellness, IT-equipment, healthcare, career advisory are all "tier status unlocks a partner discount code," not a redeemable credit purchase. No category keeps a credit-based mechanic. Long-term ambition: a global loyalty programme, same tier/discount-code shape, cross-jurisdiction.

**Privacy invariant**: this model is only privacy-clean if discount codes stay **generic** (the same code for everyone at a tier) — same pattern as the Training AWS-voucher ad's "no tracking." A personalized/tracked code would reintroduce a data-sharing consent question with the partner vendor.

**Legal status: confirmation-only, not a hard blocker** (downgraded 2026-07-21), conditional on the no-stored-value/no-payment-nexus facts above holding. See LEGAL_REVIEW.md for the confirmation question and the residual risks it must still surface (affiliate/referral disclosure, consumer-protection/advertising rules on discount-claim accuracy, "loyalty programme" branding/jurisdiction rules independent of stored value, the cross-jurisdiction angle). Falls back to the general private-beta-plus-parallel-review sequencing, same as Training and the narrowed AI-Credit Marketplace. Near-term scope is career benefits only; regulated financial benefits (insurance, etc.) are explicitly future-roadmap.

## 7c. Roadmap adjacency — Contextual advertising (later-stage; not yet built)

Ads, if introduced, are **contextual only — no behavioral or individual-level tracking**. Targeted by page context (role/skill/surface shown), never by profiling an individual across their data or via cross-site pixels. No PII is exposed to advertisers. Any cohort-level targeting would reuse the §2e k-anonymity threshold and require its own consent posture (LEGAL_REVIEW.md). This keeps advertising consistent with the privacy-first moat rather than in tension with it.

## 8. AI/LLM Strategy

- **MVP**: base open-weight models (Llama 3 / Mistral) + prompt engineering + region-specific retrieval (RAG) for HK/SG hiring context. This gets most of the matching-quality value at a fraction of the cost/time of fine-tuning.
- **Fine-tuning (Cantonese/Singlish NLP)**: explicitly deferred to Month 12+. Compute cost is trivial (~$1-5 per training run), but corpus curation — sourcing/labeling a quality Cantonese/Singlish hiring dataset — is the real cost (~$5-15K, 3-6 months) and isn't worth front-loading before product-market fit.
- **Skill assessments**: AI-generated, human-reviewed before use.

## 9. Scaling Notes

- **pgvector is the right choice at MVP and well beyond** — suitable up to roughly 10M vectors at expected query rates. Don't pre-migrate to a dedicated vector DB (Pinecone/Qdrant) until p99 query load exceeds ~50 req/sec or advanced filtering needs outgrow pgvector — premature migration adds cost and complexity with no near-term benefit.
- **Serverless LLM cost guardrail**: the $2,500/mo infra budget (BUSINESS.md §10) is realistic for matching-pipeline inference alone if volume stays controlled; the AI-Credit Marketplace introduces a separate, variable cost line once it ships and needs its own monitored budget/cap, not folded into the matching-pipeline number.

## 10. Revenue/Entitlement Logic

- **Independent headhunters/agencies**: fee-for-access only — reveal fees + Pro subscription. No success/placement fee enforced anywhere in the data model for this segment (a deliberate call; see BUSINESS.md §7).
- **Enterprise tier**: includes a tiered commission entitlement (lower % entry-level placements, higher % executive placements), offsettable via a higher platform-fee tier, plus job-listing priority. This model is explicitly evolving — implement the mechanism (a commission-percentage field per placement, tied to a role-seniority tag) without hard-coding final percentages.

## 11. Open Questions

- Exact data-retention window (pending legal review — see BUSINESS.md §11).
- Exact enterprise commission percentages (pending further business-side brainstorming).
- Exact $-cap sizing for free vs. Pro AI-Credit Marketplace allowances — needs real cost modeling from early usage before the fast-follow ships.
- AI-Credit Marketplace career-task classifier design (exact scope-enforcement mechanism, §7) — deferred to build time.
- Training credit costs per course and the points→credit conversion rate (§7a) — no placeholder invented ahead of real usage data.
- Market Intelligence pricing (§2e) — deferred/roadmap-only, same philosophy as the AI-Credit Marketplace $-caps.

## 12. MVP Implementation Notes (2026-07-17 — what's actually built)

The walking skeleton is live in this repo (see README.md for commands). Where
the MVP diverges from the sections above, the MVP choice is recorded here; the
sections above remain the target architecture.

- **Hosting**: Cloudflare Workers via `@opennextjs/cloudflare`, not Vercel —
  Vercel's free (Hobby) tier prohibits commercial use. Migrate to Vercel Pro
  post-prototype if DX justifies the spend. Consequence: the app uses the
  legacy `middleware.ts` convention (Next 16's `proxy.ts` is Node-only;
  OpenNext requires edge middleware).
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
- **Deferred, tables in place**: point purchases ("top-ups coming soon" error
  path exists), verified-action earning, interview-scheduling UI, enterprise
  entitlements, company verification, email notifications, AI-Credit
  Marketplace (§7 — confirmation-only legal status as of 2026-07-21, not a
  hard blocker; still not-yet-built pending real usage-cost data).
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
