# DESIGN.md — JumpOnBoard (J.O.B.) Technical Architecture

Companion to [BUSINESS.md](./BUSINESS.md) (strategy/pitch) and [VISION.md](./VISION.md) (goals/metrics). This document describes how the product is actually built. Status: pre-code — this is the architecture to build against, not a description of existing code.

## 1. System Overview

Solo-founder, AI-assisted ("vibe coding") build. Architecture favors managed services and low operational overhead over anything requiring dedicated ops/on-call.

Components:
- **Frontend**: Next.js (React) web app — candidate/recruiter/enterprise portals, in-app messaging, interview scheduling.
- **Backend**: Supabase (Postgres) hosted in AWS ap-east-1, with pgvector for embedding similarity search and Row Level Security (RLS) as the primary access-control layer.
- **Matching/AI service**: serverless LLM inference (Modal or Baseten, open-weight models — Llama 3 / Mistral) for resume redaction, embedding generation, and skill assessment content.
- **Points ledger service**: closed-loop, non-monetary credit system (earning, spending, refunds, reveal compensation).
- **Messaging & scheduling service**: in-app only — this is a retention mechanic, not a convenience feature (see §4).
- **AI-Credit Marketplace gateway** (fast-follow, post-MVP): API proxy issuing OpenAI-compatible keys, metered against points balance.

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

**Override path — paid, pre-opt-in reveal:**
- A recruiter/enterprise can pay *additional* points to reveal a candidate who hasn't opted in to that specific match.
- If the candidate declines post-reveal: recruiter gets a **partial refund**.
- Candidate is **compensated in points regardless of outcome** (accept or decline) — this is the incentive for candidates to leave override enabled; they earn even from declined interest.
- **Per-candidate toggle** (`consent_flags.reveal_override_enabled`): if disabled, no override is possible for that candidate at any price. Privacy-first by default.

**Per-role scoping & pricing:**
- A reveal only unlocks a candidate for the specific job posting it's tied to. Revealing the same candidate against a different posting requires a new reveal.
- Revealing a 2nd+ candidate against the *same* posting is discounted — nudges recruiters toward multi-candidate comparisons per role rather than one-off reveals, which increases average revenue per posting.

**Why this design, not a legal lock-in**: an anti-circumvention clause or placement-fee revenue share was rejected — it's a dealbreaker for independent headhunters, who won't give up commission on top of a platform fee (see BUSINESS.md §3/§7). Retention here is earned through product stickiness ("hurdles, not blockers"), not contractual restriction.

## 5. Privacy & Security Architecture

**Redaction approach and its limits**: names, employers, and direct contact fields are stripped; quasi-identifiers are generalized. This reduces but does not eliminate re-identification risk — current literature on LLM-agent re-identification attacks and stylistic fingerprinting shows pseudonymized text can, in some cases, be re-linked to an individual, especially in small/niche talent pools. We do not design around a "zero re-identification risk" claim. Mitigations: rate-limited reveals, quasi-identifier generalization, no raw-resume access outside the ingest pipeline.

**Access control**: Supabase RLS as the primary enforcement layer — a seeker's raw resume and unredacted PII are never queryable by a recruiter/enterprise role; only skill vectors and (post-reveal) disclosed fields are.

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

## 7. AI-Credit Marketplace (fast-follow feature — design now, build immediately after MVP)

Confirmed scope: a genuinely **open, OpenAI-compatible API key**, usable with any third-party agent (Hermes Agent, OpenClaw, or anything else) — not restricted to a JumpOnBoard-branded skill. This is a deliberately bigger cost/abuse surface than a scoped-down version, accepted as a tradeoff for how attractive/differentiated it is to a technical seeker audience. Validated against a real comparable: **OpenCode Go** ($10/mo, dollar-value usage caps, OpenAI-compatible, explicitly Hermes-Agent/OpenClaw-compatible).

Architecture:
- **API gateway/proxy service** issues per-user OpenAI-compatible keys.
- Backed by the **same Modal/Baseten-hosted open-weight models** (Llama 3 / Mistral) already used for matching — reuses existing serverless LLM infra rather than standing up a separate stack.
- **Metering is dollar-value-based per user per period** (mirrors OpenCode Go's model, not raw request counts) — funded from the user's points balance.
- **Hard per-period $-cap enforced at the gateway**, regardless of which third-party agent is driving the calls — this is the abuse/cost guardrail given the key works with agents that can run autonomous/unattended loops (e.g. OpenClaw's "heartbeat" polling).
- **Never proxies to premium/frontier models** — open-weight only, to keep the cost model survivable.
- **Allowance tiers**: free seekers get a small points-funded allowance; Pro seekers ($9.99/mo) get a guaranteed larger allowance bundled into the subscription.

**Explicitly not MVP**: ships as the first feature immediately after MVP, once real usage data exists to size the $-caps safely. Building the gateway's metering/cap enforcement can start during MVP development, but it should not gate MVP launch.

**Hard launch blocker**: the points system's licensing exemption (§6, BUSINESS.md §11) depends on redemption staying narrow/single-purpose. Redeeming points for general-purpose compute usable with arbitrary third-party agents is a broader redemption surface than "AI resume rewriting" and pushes toward fungible value rather than a single-purpose facility. **This feature does not ship until SG/HK counsel has signed off on the exemption question** — see [LEGAL_REVIEW.md](./LEGAL_REVIEW.md) for the briefing memo. Treat this as a launch blocker for the AI-Credit Marketplace specifically, distinct from the rest of MVP, which proceeds under the private-beta-plus-parallel-legal-review approach (BUSINESS.md §11).

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
