Executable Strategy Plan: "JumpOnBoard" (J.O.B.)

**Version 1.2** · Last updated 2026-07-17 · Revision history at the end of this document. Companions: DESIGN.md (technical), VISION.md (goals), MEMORY.md (decision log).

The Privacy-First, AI-Driven Continuous Hiring Ecosystem
Launch Market Focus: APAC (Hong Kong & Singapore Base)

1. Executive Summary & Company Purpose

Company Purpose: JumpOnBoard (J.O.B.) is an AI-driven, privacy-first career ecosystem that empowers professionals and companies to match on skills and compensation fit — without revealing Personally Identifiable Information (PII) or current compensation data — until both sides have expressed mutual interest.

The Vision: We are disrupting the traditional, episodic, and highly biased recruitment industry in Asia. By leveraging Serverless Private Large Language Models (LLMs) and a dual-sided, closed-loop Points Economy, J.O.B. eliminates the "Prisoner's Dilemma" of salary negotiation. We act as a trust-minimizing broker, ensuring mutual alignment on compensation and skills before identities are revealed — pseudonymized by default, hardened with defense-in-depth, not marketed as an absolute anonymity guarantee (see §3 and DESIGN.md for why that distinction matters).

Our Stance on Agencies: We do not compete with headhunters; we empower them. We provide individual recruiters with an unparalleled "dark pool" of passive talent, allowing them to spend micro-fees to unlock resumes that yield massive placement commissions.

2. The Problem: The APAC Hiring Dilemma

The hiring market in Asia—particularly in high-density tech/finance hubs like Hong Kong (HK) and Singapore (SG)—suffers from systemic inefficiencies and a severe lack of trust.

The Pain for Job Seekers (The "Payslip" Culture):

Current Salary Anchoring: In HK and SG, recruiters routinely demand candidates' current salary and payslips before making an offer, anchoring new offers to old salaries.

Privacy & Retaliation: Looking for a job on public platforms like LinkedIn exposes talent to retaliation from current employers.

The Pain for Headhunters & Companies:

Low Signal, High Noise: Postings on regional boards result in thousands of unqualified applications.

The Sourcing Grind: Independent headhunters spend 80% of their time cold-messaging passive candidates on LinkedIn who never reply.

The Misalignment Trap: Talent acquisition teams waste weeks interviewing candidates only to find their budget is 40% below the candidate's expectations.

3. The Solution: The J.O.B. Ecosystem

J.O.B. creates a "dark pool" of passive, high-intent talent using advanced AI and a closed-loop points economy — no cash vouchers, no stored monetary value, by design (see §7 and §11 for why this matters legally).

Core Product Pillars

1. The Secure Vault (Pseudonymized, Defense-in-Depth): Resumes are ingested by our Private LLM and converted into skill vectors. Names and previous employers are redacted, and quasi-identifiers (unique skill combinations, narrow geographic/tenure signals) are generalized where possible. We do not claim "zero re-identification risk" — current research shows pseudonymized profiles can, in principle, be re-identified via stylistic fingerprinting or auxiliary data. We manage this as an ongoing, disclosed risk with layered technical controls (redaction, generalization, rate-limited reveals) rather than an absolute guarantee. See DESIGN.md for the full threat model.

2. The Dealbreaker Matrix: Candidates define absolute boundaries: Minimum Base Salary, Equity, and Work setup. Candidates never disclose their current salary.

3. Double-Blind Matching, Consent-First Reveal: The AI matches the Job Description against the candidate's skill vectors and Matrix. By default, a candidate must actively express interest in a specific match before any recruiter can send a Reveal Request (double opt-in). A recruiter/enterprise client may pay additional points to override this and reveal a non-opted-in candidate directly; if the candidate declines post-reveal, the recruiter receives a partial refund, and the candidate is compensated in points regardless of the outcome — this is what makes candidates willing to keep the override enabled. Override is a per-candidate toggle: candidates can disable it entirely, in which case no override is possible for them at any price. Privacy-first by default; monetization-friendly if the candidate opts in.

4. The Engagement Moat (Reveal Mechanics): A Reveal is always scoped per-role — revealing a candidate for one job doesn't unlock them for another; recruiters pay again to reveal the same candidate against a different posting. Revealing a 2nd+ candidate against the *same* role is discounted, nudging recruiters toward comparing multiple candidates per posting rather than one-and-done. On reveal, the candidate's name and a job-fit summary are disclosed; email and phone are withheld unless the candidate separately consents. All recruiter↔candidate contact is routed through in-platform messaging, and interview scheduling ships as a core MVP feature alongside it. We deliberately chose "hurdles, not blockers" over contractual anti-circumvention clauses or a placement-fee revenue share — headhunters wouldn't accept giving up commission on top of a platform fee, so retention has to be earned through product stickiness, not a legal leash.

5. AI-Credit Marketplace (Fast-Follow, immediately post-MVP): Job seekers can fund an open, OpenAI-compatible API key — usable with any third-party autonomous agent, including popular open-source frameworks like Hermes Agent and OpenClaw — via their points balance. Usage is metered by a dollar-value cap per period against cheap open-weight models (Llama 3 / Mistral), never premium/frontier models, mirroring the model used by OpenCode Go, a real $10/month product that already does exactly this and is itself compatible with Hermes Agent and OpenClaw. Free seekers get a small points-funded allowance; Pro seekers ($9.99/month) get a guaranteed larger allowance — this is the concrete answer to "why upgrade to Pro." This ships as the first feature after MVP launch, not on day one, since it depends on cost data from real usage to size safely. See DESIGN.md for the metering/gateway architecture.

Points Economy (Closed-Loop, Non-Monetary):

Seekers Earn: Points for AI-verified quality actions — passing a skill assessment, a verifiable work-history signal — not for raw profile-field edits (this prevents low-effort profile farming for free redemptions). Points are also earned automatically whenever a profile is revealed (accepted or declined), which pays candidates for participating in the marketplace even when a match doesn't convert.

Seekers Spend: Points for AI resume rewriting, and (post-MVP) AI-Credit Marketplace API allowance top-ups.

Recruiters Spend: Points for "Reveal Requests" (per-role, with same-role multi-candidate discounts) and for the consent-override path described above.

Points are explicitly non-transferable and non-redeemable for cash or real-world vouchers — this is a deliberate design choice, not an oversight: it keeps the points system as a closed-loop, single-purpose loyalty instrument, which is the standard basis for exemption from stored-value-facility/e-money licensing under both Singapore's Payment Services Act and Hong Kong's Stored Value Facilities Ordinance. Terms of service must state this explicitly to preserve the exemption, and a light legal review of the points T&Cs is planned during our private beta (see §11).

4. Why Now? (The Inflection Point)

The Pushback on Salary Anchoring: APAC professionals are rebelling against disclosing current salaries, creating a market gap for "value-based" hiring.

Serverless AI Economics: Tools like Modal and RunPod Serverless now allow startups to run sandboxed, private LLMs for pennies per inference, destroying the traditional infrastructure barriers to entry.

Cost-Cutting in Post-ZIRP APAC: Companies in HK and SG are slashing HR budgets. Independent headhunters need cheaper, faster ways to source guaranteed placements.

5. Market Size (APAC Focus)

References: Grand View Research (Global HR Software Market), IBISWorld (Employment Agencies Asia).

TAM: ~$16-20 Billion (Global Core HR Software Market — corrected from an earlier draft's $39.9B figure, which appears to have conflated the broader HR technology/services/outsourcing market with the narrower SaaS software segment we actually compete in. Citing the accurate, defensible number matters more for investor credibility than citing the bigger one).

SAM: ~$3.5-6.5 Billion (APAC Professional Staffing & Recruitment Software) — flagged for independent, bottom-up validation before use in a fundraising deck; the upper end of this range has not been independently confirmed against primary sources.

SOM: $120 Million (Targeting Tech/Finance professionals and registered agency headhunters in HK and SG for the initial 24-month rollout) — presented as our own bottom-up estimate, not an externally sourced figure; needs revisiting once we have real HK/SG tech/finance hiring-volume data from the private beta.

6. Business Moat (Defensibility)

The Verified Candidate "Dark Pool": Candidate data profiles are our ultimate moat. Competitors cannot easily scrape a localized, highly engaged pool of passive talent hidden behind a privacy wall.

Sandboxed Private LLM Fine-Tuning (Roadmap, Month 12+): By hosting private models fine-tuned on APAC hiring nuances (Cantonese/Singlish NLP), we aim to create matching accuracy that generic wrappers of frontier-model APIs cannot replicate. At MVP, we rely on strong open-weight base models plus prompt engineering and region-specific retrieval — fine-tuning is deferred until we have real usage data, since the compute cost is trivial but the corpus curation (an estimated $5-15K and 3-6 months to build a quality Cantonese/Singlish hiring corpus) is not worth front-loading before product-market fit.

Ecosystem Lock-in (Points): Users actively lose accumulated platform value (points) if they abandon their J.O.B. profile, creating strong retention. Combined with in-platform messaging/scheduling and the AI-Credit Marketplace, retention is built on product stickiness ("hurdles") rather than contractual restriction ("blockers") — see §3.

7. Competitor Pricing & J.O.B. Revenue Model

To capture market share efficiently, J.O.B. utilizes a Tri-Tier Freemium model, benchmarked against incumbent platforms.

Competitive Benchmarks:

LinkedIn Recruiter Lite: ~$170/month (verified current pricing; higher than an earlier draft's $140-170 range).

LinkedIn Recruiter Corporate/Enterprise: ~$10,800-12,960/seat/year (verified current pricing; higher than an earlier draft's $8,999-10,800 range — LinkedIn has raised prices since). Note: LinkedIn does not publish a transparent enterprise rate card, so exact undercutting claims should be made cautiously.

Hired.com / Agency Fees: 15%-25% of candidate base salary. Note: Hired.com itself was acquired in 2020 amid reportedly weak standalone financials — a useful cautionary data point on pure reverse-marketplace economics, and part of why our model leans on points/subscriptions rather than placement-fee dependence for the headhunter segment (see below).

J.O.B. Pricing Structure (all prices in USD):

1. B2C (Job Seekers)

Basic (Free): Create a vault profile, unlimited passive matching, earn points via verified actions. Unlimited free matching is a deliberate choice — candidate supply is the harder side of this two-sided marketplace to bootstrap, so we don't gate the core value prop for seekers.

Pro Seeker ($9.99/month): Accelerated point earning, "Active Looker" algorithmic boost, unlimited AI resume/cover-letter rewriting, and a guaranteed larger AI-Credit Marketplace allowance once that feature ships (see §3).

2. B2C / Prosumer (Independent Headhunters & Agencies)

Strategy: Undercut LinkedIn Recruiter Lite while offering guaranteed intent. Pure fee-for-access — no placement/success fee for this segment. This was a deliberate design decision: a placement-fee revenue share was a non-starter for independent headhunters unwilling to give up commission on top of a platform fee, so all revenue here comes from reveal fees and subscription, not from a cut of the hire.

Basic (Free): 5 starter points to test AI matching.

Pro Headhunter ($99/month): Includes a monthly bundle of Reveal points, advanced Dark Pool boolean search, and AI-optimized outbound messaging.

Micro-transactions: Top-up points for $15-$20 per "Reveal Request" (discounted for a 2nd+ reveal against the same role).

3. B2B (Enterprise / In-House HR)

Strategy: Provide enterprise-grade ATS integration at a fraction of LinkedIn Corporate's list price.

Pro SaaS Tier ($599/month/seat or $6,000/year): Includes a monthly points bundle, ATS integrations (Workday/Greenhouse), team collaboration, and prioritized AI matching for corporate career pages.

Enterprise Success Fee (working model, still evolving): unlike the independent-headhunter segment, Enterprise clients can carry an optional, tiered commission on successful placements — lower percentage for entry-level roles, higher for executive placements — with pricing negotiated per client. Enterprises can partially offset this commission by paying a higher platform-fee tier, and get job-listing priority/visibility as a stated benefit. We're intentionally not locking exact percentages here; they'll be set once we have real placement data.

8. Product & Technical Architecture (Hyper-Lean)

We utilize Vibe Coding Methodology (Cursor/Copilot/Claude Code) paired with modern Serverless architecture, built by a solo founder leaning on AI coding agents rather than a founding engineering team. Full technical detail lives in DESIGN.md; summary below.

Frontend: Next.js (React) web application, including in-platform messaging and interview scheduling as MVP-scope features (not deferred — they're core to the retention strategy in §3).

Backend: Supabase (PostgreSQL) hosted in APAC (AWS ap-east-1), with pgvector for embedding similarity search and strict Row Level Security (RLS).

The Serverless Private AI Stack: Instead of paying $10k+/mo for idle dedicated GPU clusters, we deploy open-weights models (Llama 3, Mistral) on Serverless GPU infrastructure like Modal or Baseten. Models spin up, execute inference (resume vectorization/matching), and spin down in seconds — we pay per millisecond of compute. At MVP, matching relies on these base models plus prompt engineering and retrieval, not fine-tuning (see §6).

Skill Assessments: Content is AI-generated and human-reviewed before use — this both improves matching quality and serves as the gate for point-earning (raw profile edits don't earn points; verified actions do).

Security: Serverless sandboxing bounds data exposure during inference, but region hosting (AWS ap-east-1) alone does not satisfy PDPA/PDPO cross-border obligations — we pair it with data processing agreements/model contractual clauses as needed. See DESIGN.md for the full privacy architecture and its acknowledged limits.

9. Go-To-Market (GTM) Strategy

Beachhead: Intentionally unsequenced — we launch targeting tech and finance professionals in HK/SG simultaneously, rather than picking one vertical first, matching the broad TAM framing in §5.

Shipping Timeline: Prototype within July 2026; aggressive push to a public MVP within ~3 months (~October 2026); target first user sign-ins by end of 2026. This is a solo-founder, AI-assisted build timeline — separate from the revenue/breakeven timeline in §10, which is intentionally more conservative (see below).

Phase 1: Supply-Side "Dark Pool" (Months 1-3 post-MVP)

Market as a "Secure Career Vault." Users upload resumes for a free AI optimization, setting their "Dealbreaker Matrix" and entering the dark pool. Launch as a private beta (limited/invited users) — see §11 on why this beta runs alongside, not blocked by, formal legal review.

Phase 2: Headhunter Empowerment (Months 4-9)

Target independent recruiters in HK/SG via LinkedIn outreach. Offer free points. Once they experience a candidate instantly replying (because the Matrix aligns), they convert to the $99/mo Pro tier. Ship the AI-Credit Marketplace as the first fast-follow feature in this window.

Phase 3: Enterprise Rollout (Months 10-24)

Use traction generated by headhunters placing J.O.B. candidates to sell the Enterprise product directly to corporate HR teams.

10. Financial Projections & Breakeven Analysis

By utilizing serverless AI and vibe-coding, we have drastically compressed the capital required to reach profitability. We present both an aggressive upside case and a base case grounded in industry sales-cycle and marketplace cold-start benchmarks — a plan with only the upside case is a plan investors will (rightly) discount.

Estimated Monthly Operating Expenses (OpEx)

Serverless Cloud & AI (Modal, Supabase, Vercel): ~$2,500/mo at MVP scale, realistic if inference volume stays within modeled bounds (this needs an explicit cost guardrail/cap — see DESIGN.md — since AI-Credit Marketplace usage post-launch introduces a new, variable cost line beyond matching-pipeline inference).

Marketing & Point Redemptions: ~$4,500/mo

SaaS Tools, Legal & Misc: ~$3,000/mo

(Note: Assumes founder sweat-equity / zero-draw during the seed phase, consistent with the solo-founder/vibe-coding execution model.)

Total Target Lean OpEx: ~$10,000/month

Revenue Targets for Breakeven ($10,000 MRR)

Upside Case (as originally modeled): Enterprise Target: 10 seats @ $599/mo = $5,990/mo; Headhunter Target: 30 Prosumers @ $99/mo = $2,970/mo; Seeker Target: 100 Pro Seekers @ $9.99/mo = $999/mo. Estimated MRR: $9,959/month. Timeline: breakeven by Month 9 post-launch.

Base Case (grounded in benchmarks): Enterprise sales cycles for an unknown startup typically run 6-18 months even once outreach starts, and two-sided marketplaces most commonly fail on supply-side liquidity before demand-side monetization becomes the binding constraint. A more defensible timeline targets the same milestone (10 enterprise + 30 headhunters + 100 pro seekers, $10K MRR) at 18-24 months post-launch, not 9. We treat the 9-month case as the upside scenario to strive for, not the plan of record for cash-runway purposes.

Timeline to Breakeven

Months 1-4 (post-MVP): Development & Supply Aggregation (Zero Revenue).

Months 5-9: Headhunter onboarding & initial Enterprise pilots; AI-Credit Marketplace ships in this window.

Month 9 (Upside Case) / Months 18-24 (Base Case): Projected Breakeven Point, requiring 10 Enterprise clients and 30 Headhunters at the stated tiers.

11. Risk Management

Data Privacy (PDPA/PDPO): Sandboxed serverless execution ensures no data is retained in GPU memory post-inference; PII is decoupled at rest in Supabase. We do not claim the resulting skill-vector data is "anonymous" in the strict legal sense — pseudonymized data that could in principle be re-identified remains personal data under both PDPA and PDPO, so our consent flows, retention policy, and cross-border transfer approach are designed around that reality rather than around an anonymity exemption. Retention is designed to be long but explicitly bounded (not indefinite-by-default), with the exact window to be finalized during legal review.

Tokenomics/Licensing: The points economy is deliberately closed-loop and non-monetary — no cash purchase-and-cash-out, no real-world voucher redemption — specifically to avoid triggering Singapore's Payment Services Act (e-money/stored-value-facility licensing) or Hong Kong's Money Service Operator / Stored Value Facility licensing regimes. Terms of service must explicitly state points are non-transferable and non-cash-redeemable to preserve this exemption.

**Hard blocker, not just a flag**: the single-purpose/closed-loop exemption this relies on assumes redemption stays narrow (our own services). The AI-Credit Marketplace (§3 pillar 5) redeems points for general-purpose compute usable with arbitrary third-party agents — a materially broader redemption surface than "AI resume rewriting," and closer to fungible value than a single-purpose facility. Separately, the reveal-override flow (recruiter pays cash-purchased points → candidate is compensated in points regardless of outcome) routes cash-origin value from one party to another through the platform, which stresses the "non-transferable" premise. **The AI-Credit Marketplace does not ship until SG/HK counsel has signed off on this specific exemption question** — see [LEGAL_REVIEW.md](./LEGAL_REVIEW.md) for the briefing memo and exact questions for counsel. This is stricter than the general private-beta-plus-parallel-review sequencing for the rest of the points system.

Re-identification Risk: Acknowledged as a residual, non-zero risk (see §3, Pillar 1) rather than designed around an absolute anonymity claim. Mitigated via redaction, quasi-identifier generalization, and rate-limited reveals; not eliminated.

Marketplace Leakage: Addressed via product stickiness ("hurdles, not blockers") rather than contractual restriction — per-role reveals, same-role multi-candidate discounts, in-platform messaging/scheduling, and contact-info gating — since a legal anti-circumvention clause or placement-fee revenue share was a dealbreaker for independent headhunters (see §3, §7).

Legal Review Sequencing: We are launching a private beta (limited/invited users) with formal SG/HK legal review of the points T&Cs and PDPA/PDPO consent flows running in parallel, rather than gating launch on it. This is a deliberate speed-vs-diligence tradeoff appropriate to a pre-seed, solo-founder stage — full public launch should not proceed without that review having concluded.

Vibe Coding Security: Before Enterprise launch, a portion of seed capital will be allocated to a third-party cybersecurity audit (e.g., CREST certified penetration test) to ensure AI-generated code contains no vulnerabilities.

Note: This section reflects our own risk assessment and directional research, not formal legal advice. Actual SG/HK legal counsel review is planned (see above) and required before any commitments here (points T&Cs, data retention windows, consent flows) should be treated as final.

12. Company Setup

Legal Entity: Singapore holding company with Singapore and Hong Kong operating companies (SG opco = primary PDPA regime, HK opco = PDPO). Redomiciling the holding entity to a tax-favorable jurisdiction to court US/international VCs is a Series A+ consideration, not a pre-seed one.

Domain & Brand: We keep the "JumpOnBoard" name. The `.com` is currently an inactive, for-sale listing (via HugeDomains) from an unrelated, now-defunct company that used the same name — not an active competitor. We launch under `jumponboard.hk` and `jumponboard.sg` for MVP and plan to acquire the `.com` after seed/Series A funding closes.

Team: Solo founder, building with AI coding agents ("vibe coding") — consistent with the technical approach in §8.

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-17 | Original strategy draft (pre-research). |
| 1.1 | 2026-07-17 | Research-driven revision: TAM corrected to ~$16-20B; "zero re-identification" reframed as pseudonymization + defense-in-depth; tokenomics redesigned as closed-loop non-monetary points; base-case (18-24mo) breakeven added alongside 9mo upside; reveal "engagement moat" mechanics; company setup section. |
| 1.2 | 2026-07-17 | AI-Credit Marketplace named as pillar 5 with hard legal blocker (LEGAL_REVIEW.md); dual-role registration; enterprise tiered-commission working model. |
