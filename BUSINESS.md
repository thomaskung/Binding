Executable Strategy Plan: "JumpOnBoard" (J.O.B.)

**Version 1.7** · Last updated 2026-07-23 · Revision history at the end of this document. Companions: DESIGN.md (technical), VISION.md (goals), MEMORY.md (decision log).

The Privacy-First, AI-Driven Continuous Hiring Ecosystem
Launch Market Focus: APAC (Hong Kong & Singapore Base)

1. Executive Summary & Company Purpose

Company Purpose: JumpOnBoard (J.O.B.) is an AI-driven, privacy-first career ecosystem that empowers professionals and companies to match on skills and compensation fit — without revealing Personally Identifiable Information (PII) or current compensation data — until both sides have expressed mutual interest.

The Vision: We are disrupting the traditional, episodic, and highly biased recruitment industry in Asia. By leveraging Serverless Private Large Language Models (LLMs) and a dual-sided, closed-loop Points Economy, J.O.B. eliminates the "Prisoner's Dilemma" of salary negotiation. We act as a trust-minimizing broker, ensuring mutual alignment on compensation and skills before identities are revealed — pseudonymized by default, hardened with defense-in-depth, not marketed as an absolute anonymity guarantee (see §3 and DESIGN.md for why that distinction matters).

The Business Underneath: J.O.B. is, structurally, a **data-collection business — kept strictly inside a privacy-first frame**. By becoming the user's continuous, AI-maintained resume keeper (roadmap — see §3 and DESIGN.md §2c), we accumulate the freshest, most structured career dataset in the region. We monetize that dataset **only in aggregate, non-identifiable form** (market-intelligence signals — see §7); individual PII is never sold or shared. Privacy is simultaneously the #1 product priority *and* the moat: the trust that makes people willing to keep a maintained profile is the same trust that produces the data asset. Any monetization that would require exposing individual data is out of scope by design.

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

4. The Engagement Moat (Reveal Mechanics): A Reveal is always scoped per-role — revealing a candidate for one job doesn't unlock them for another; recruiters pay again to reveal the same candidate against a different posting. Reveal pricing is a **bid/allocation mechanism** (recruiter monetization detail in §7, mechanics in DESIGN.md §4): cost scales with match quality and discounts on a 2nd+ reveal against the *same* role, nudging recruiters toward comparing multiple candidates per posting rather than one-and-done, while letting well-funded recruiters "bid" for top candidates and budget-conscious recruiters naturally reveal less-competitive candidates (including new graduates) who'd otherwise rarely get looked at. On reveal, the candidate's name and a job-fit summary are disclosed; email and phone are withheld unless the candidate separately consents. All recruiter↔candidate contact is routed through in-platform messaging, and interview scheduling ships as a core MVP feature alongside it. We deliberately chose "hurdles, not blockers" over contractual anti-circumvention clauses or a placement-fee revenue share — headhunters wouldn't accept giving up commission on top of a platform fee, so retention has to be earned through product stickiness, not a legal leash.

5. AI Career-Assistant Credit Allowance (Fast-Follow, immediately post-MVP; scope narrowed 2026-07-21 — see DESIGN.md §7, MEMORY.md): Job seekers get access to an AI-Credit allowance scoped to career/JOB-related tasks — resume rewriting, cover letters, interview prep, career-path guidance — via a classifier-gated OpenAI-compatible API key (still usable with agent frameworks like Hermes Agent/OpenClaw within that scope). This is deliberately narrower than the original "genuinely open, any-purpose" design: being JumpOnBoard's own compute doesn't by itself narrow what an unrestricted key could be pointed at, so the redemption is scoped for real, not just described, which is what keeps it a single-purpose benefit like AI resume rewriting rather than general-purpose value. Usage is metered by a dollar-value cap per period against cheap open-weight models (Llama 3 / Mistral), never premium/frontier models — a $-capped subscription is a validated model (see OpenCode Go, $10/month), though that comp is weaker here since OpenCode Go's differentiator is unrestricted general-purpose use, which this feature no longer offers. Funding is hybrid: free seekers get a small points-funded allowance; Pro seekers ($9.99/month) get a guaranteed larger allowance, and either tier can also top up with direct cash. This ships as the first feature after MVP launch, not on day one, since it depends on cost data from real usage to size safely. General-purpose AI-infrastructure reselling (the original open-to-any-agent idea) is explicitly out of scope here — a separate, unscoped future business line if ever pursued, evaluated from scratch. See DESIGN.md for the metering/gateway/classifier architecture.

6. Continuous AI Resume Maintenance (Roadmap — not yet built; see DESIGN.md §2c): Onboarding leads with resume upload rather than manual form-filling, and an AI agent keeps the resume current over time — periodically asking "anything new in your career?" and drafting updates on a strict suggest-and-approve basis (the AI never fabricates; it only files facts the user gives it). This attacks the core reason passive-talent data goes stale — users won't maintain a profile by hand for free — and turns J.O.B. into the de-facto lifelong resume maintainer. That is the stickiness moat and the freshness engine behind the aggregate-data business above. The UI adapts to profile/freshness/intent state (deterministic, not runtime-generative — DESIGN.md §2d). **This mechanic now also earns points** (see "Seekers Earn" below, new "freshness confirmation" category, added to close the flywheel gap in §6a) — closing the biggest structural gap in the retention loop: the mechanic the business depends on most for data freshness previously earned nothing.

Points Economy (Closed-Loop, Non-Monetary):

Seekers Earn: Points for AI-verified quality actions — passing a skill assessment, a verifiable work-history signal — not for raw profile-field edits (this prevents low-effort profile farming for free redemptions). Points are also earned automatically whenever a profile is revealed (accepted or declined), which pays candidates for participating in the marketplace even when a match doesn't convert. A third category, added this revision: a narrow, **rate-limited** "freshness confirmation" (e.g. quarterly, or on crossing a tenure milestone) tied to a real suggest-and-approve update inside the Continuous AI Maintenance flow (Pillar 6) — this is deliberately not framed as "AI-verified" (a self-reported "still at the same job" confirmation or a new accomplishment isn't independently verifiable the way a skill-assessment pass is); what preserves the anti-farming intent is the rate limit plus the requirement that it's a real suggest-and-approve maintenance event, not a raw field edit.

Seekers Spend: Points for AI resume rewriting, and (post-MVP) AI-Credit Marketplace API allowance top-ups.

Recruiters Spend: Points for "Reveal Requests" (per-role, priced by match-quality tier with same-role multi-candidate discounts — §7) and for the consent-override path described above, plus its recruiter-initiated reversal (§7, LEGAL_REVIEW.md).

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

The Verified Candidate "Dark Pool": Candidate data profiles are our ultimate moat. Competitors cannot easily scrape a localized, highly engaged pool of passive talent hidden behind a privacy wall. The continuous-AI-maintenance loop (§3, roadmap) deepens this: a *fresh, structured, continuously-updated* dataset compounds in value and is far harder to replicate than a one-time scrape of stale profiles — and it is the raw material for the aggregate market-intelligence line in §7.

Sandboxed Private LLM Fine-Tuning (Roadmap, Month 12+): By hosting private models fine-tuned on APAC hiring nuances (Cantonese/Singlish NLP), we aim to create matching accuracy that generic wrappers of frontier-model APIs cannot replicate. At MVP, we rely on strong open-weight base models plus prompt engineering and region-specific retrieval — fine-tuning is deferred until we have real usage data, since the compute cost is trivial but the corpus curation (an estimated $5-15K and 3-6 months to build a quality Cantonese/Singlish hiring corpus) is not worth front-loading before product-market fit.

Ecosystem Lock-in (Points): Users actively lose accumulated platform value (points) if they abandon their J.O.B. profile, creating strong retention. Combined with in-platform messaging/scheduling and the AI-Credit Marketplace, retention is built on product stickiness ("hurdles") rather than contractual restriction ("blockers") — see §3.

6a. The Growth Flywheel (Cross-Side)

The mechanics above are pieces of one connected loop, not two independent reward systems — and stating it explicitly matters for evaluating where the loop is weak: **seeker freshness/engagement → a liquid, high-quality candidate pool → recruiter reveal success → recruiter retention & spend → reinvestment in seeker acquisition/product → more, better seekers → loop repeats.** The dark-pool moat, the continuous-maintenance freshness engine, and reveal-compensation-regardless-of-outcome (§3) are levers that speed or slow this one loop; they are not separate flywheels for each side.

Two weak links, addressed as of this revision:

- **The freshness engine had no earn-loop attached.** Continuous AI Resume Maintenance (§3 Pillar 6) is explicitly the mechanic the retention story depends on most, yet points were never earned for staying fresh — only for skill-assessment/work-history verification and reveal events. Fixed this revision: a narrow, rate-limited "freshness confirmation" earning category (§3).
- **Recruiter retention has no earn loop by design, and that gap stays open.** Recruiters have no points-earning mechanic at all (pure spend, cash-funded) — this is a deliberate decision, not an oversight. Our working hypothesis is that recruiter churn is driven primarily by candidate-pool staleness/thinness, not price sensitivity or onboarding friction, given the current ICP (solo recruiters/independent agents, not enterprise TA teams — see §7). If that hypothesis holds, the fix for recruiter retention is keeping the seeker-side loop healthy, not inventing recruiter-side points. This should be validated against real churn data post-launch and revisited if the data says otherwise. The new subscription-based partner-miles perk (§7, "External Loyalty Partner Bridge") is a retention sweetener on top of a subscription recruiters already pay — it does not resolve this gap and should not be read as doing so; it is not an earn-by-participating loop under our own definition.

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

**Recruiter monetization runs three named tiers** (collapsed from what would otherwise be five separate pricing levers — seat fee, per-reveal price, per-role budget, ranking-boost SKU, market-intel access — into one legible ladder; see DESIGN.md §4/§6/§10 for the underlying mechanics):

- **Free**: ~1-2 Reveal-equivalent credits/month — a genuine taste of AI matching, not a Solo substitute. Recruiter signup already requires a business email, which keeps multi-account credit-stacking abuse low without needing dedicated anti-fraud tooling.
- **Solo ($99/month)** — supersedes the earlier "Pro Headhunter" naming (no existing paying subscribers under that name today, so this is a rename, not a migration): a monthly Reveal-credit bundle, advanced Dark Pool boolean search, AI-optimized outbound messaging, plus:
  - **Per-role spend budgeting**: recruiter sets (or accepts a system-suggested) a spend ceiling per job posting; reveals and AI JD-assist against that posting draw from the recruiter's single shared points balance until the posting's cap is hit.
  - **Match-quality-tiered, same-role volume-discounted Reveal pricing** (replaces the old flat per-reveal fee): reveal cost scales with the candidate's match quality and discounts on a 2nd+ reveal against the same role — a deliberate bid/allocation mechanism (§3 pillar 4), not just a price increase. A lower-scoring candidate may realistically only ever get revealed by a lower-budget recruiter, never the best-funded one — a named trade-off, not a hidden one.
  - **Recruiter-initiated override reversal**: cancel a pending override before the candidate responds; the charge is forfeited (not refunded) and paid to the candidate as compensation — flagged for counsel (LEGAL_REVIEW.md).
  - **Paid AI JD-assistant**: the AI job-description refinement tool (free during MVP) becomes a credit-consuming action.
  - All reveal/JD-assist pricing constants are placeholders, sized once real usage data exists — same discipline as the rest of this document's not-yet-launched pricing.
- **Advanced** — the named productization of Market Intelligence and job-post ranking boost (mechanics in item 4 below), available as an upsell above Solo for power-user agencies, and included as part of the Enterprise tier (§7.3) for corporate clients rather than sold as a fourth, separately-stacked SKU. Positioned around JumpOnBoard's privacy-vetted, resume-first candidate data quality — not around out-reaching LinkedIn's far larger candidate pool, which this stage of the business cannot win on directly. Market-intel access within Advanced ships only once real seeker opt-in data clears the k-anonymity coverage threshold for most target segments (§7 item 4a, DESIGN.md §2e) — gated on data coverage, not just on the feature being code-complete.

Micro-transactions: point top-ups remain available at every tier for occasional reveals outside a subscription (indicative range $15-$20/reveal at list price, actual cost governed by the match-quality/volume pricing above).

3. B2B (Enterprise / In-House HR)

Strategy: Provide enterprise-grade ATS integration at a fraction of LinkedIn Corporate's list price.

Pro SaaS Tier ($599/month/seat or $6,000/year): Includes a monthly points bundle, ATS integrations (Workday/Greenhouse), team collaboration, prioritized AI matching for corporate career pages, and the **Advanced** tier's Market Intelligence + job-post ranking-boost SKU (§7 item 2) as included capabilities rather than a further add-on purchase.

Enterprise Success Fee (working model, still evolving): unlike the independent-headhunter segment, Enterprise clients can carry an optional, tiered commission on successful placements — lower percentage for entry-level roles, higher for executive placements — with pricing negotiated per client. Enterprises can partially offset this commission by paying a higher platform-fee tier, and get job-listing priority/visibility as a stated benefit. We're intentionally not locking exact percentages here; they'll be set once we have real placement data.

**Pricing-ceiling design principle (recruiter monetization, this revision)**: total platform spend to land a given role (Reveals + AI JD-assist, scoped to that job posting's budget, §7 item 2) should stay well under a rough **~20% of the recruiter's commission earned from that placement** — a design guideline that calibrates suggested/default per-role budget defaults against an assumed typical agency commission rate (itself an open placeholder, consistent with this document's "no number invented ahead of real data" discipline), not a literally enforced constraint. JumpOnBoard has no way to know whether a placement happened or what it paid — hiring/offer/commission tracking is outside today's product surface, and recruiters won't volunteer it unless the platform materially helps with the hiring process itself, which is explicitly not the core product. Placement-outcome tracking (a recruiter marking a hire, optionally logging commission) that would let this principle become a real, enforceable constraint is a **long-range backlog item only**, contingent on a future decision to expand into hiring-process support.

4. Data & Adjacency Revenue Lines (Roadmap — not yet built; see DESIGN.md §2e, §7a-7c)

These monetize the data moat (§6) and the engaged user base *without* ever exposing individual PII. All are documented adjacencies, gated behind hiring-side product-market fit — the mission stays hiring-core (VISION.md).

- **B2B Market-Intelligence (aggregate signals)**: in-demand skills, expected salary raises, hiring velocity, and — new this revision — **basic comp, cash bonus, sales-commission (client-facing roles), and equity trend data**, giving recruiters (and future enterprise clients) a reference point for tuning JDs toward better matches. Sold under the **Advanced** recruiter tier (§7 item 2), folded into the Pro SaaS/Enterprise tier for corporate clients rather than a further separate SKU; pricing **deferred/roadmap-only** (same philosophy as the AI-Credit Marketplace's $-cap sizing — no number invented ahead of real usage/demand data; directional anchor is LinkedIn Talent Insights at $6k-$20k/yr). Packaging is **free teaser + paid depth**: aggregate teasers surfaced free (top-of-funnel/flywheel), full depth paid. Built on **opt-in, k-anonymized** data only (hard minimum-cohort threshold, no signal below it — DESIGN.md §2e); PII is never sold. **The bonus/commission/equity dimensions require new seeker-side capture fields and their own opt-in consent before they can be aggregated at all — not a one-line query change** (DESIGN.md §2e).
  - **Honest sequencing (read this before modeling revenue)**: opt-in consent + a hard k-threshold means the signal product is *structurally starved early*. The launch-readiness gate targets only ~50 candidate profiles pre-launch (§9), and only opted-in profiles in cohorts ≥ k produce any sellable aggregate. So market-intelligence revenue is a **late-stage line, not a near-term one** — treated the same way as the upside-vs-base-case discipline in §10. Do not put it in an early breakeven model. **Launch precondition, not just a revenue-timing note**: don't price or market the Market Intelligence component of the Advanced tier until a data-coverage check shows most target salary/seniority/location segments actually clear the k-anonymity threshold — a premium feature that mostly returns "insufficient data" undermines the tier's credibility.
- **Job-post ranking boost (B2B ads product)**: an enterprise-only add-on that raises a job posting's rank in the seeker's match queue, sold as a **separately metered SKU** (per-slot/per-month, indicative anchor $200-$1,000/slot/month — LinkedIn Job Slots) that Advanced-tier access unlocks the ability to purchase, not a usage included free in the flat Advanced/Enterprise price. **Boosted posts must carry a visible "Promoted" label in the seeker's queue** (DESIGN.md §2d/§4) — this is the single recruiter-monetization feature most likely to undercut the platform's privacy-first/unbiased-matching positioning if seekers ever suspect the queue is pay-to-play, so disclosure is non-negotiable, not a nice-to-have.
- **Training / Reskilling (credit-based)**: AI-driven quizzes + guided learning (individual career-path programs and corporate compliance training — AML, security). Feeds the verified-action point-earning loop. Runs on its own credit instrument — **one-way conversion from points, never back**, plus direct quiz/course earning and enterprise cash-purchased staff seats (segregated from personal credits). Redemption stays narrow (JumpOnBoard's own training content only), which keeps legal status at **confirmation-only** rather than a hard blocker — see DESIGN.md §7a, LEGAL_REVIEW.md.
- **Benefits / Loyalty (discount-code model, confirmation-only — reframed 2026-07-21, formalized this revision, see MEMORY.md)**: group discount access for corporates and individuals across all categories (career benefits first: flights, accommodation, wellness, IT-equipment upgrades, healthcare products, career advisory; long-term global loyalty programme). **No credit currency at all** — tier eligibility is a **per-side cumulative counter**, not the vague "activity/tenure" placeholder used previously: seekers qualify on **cumulative lifetime points earned**; recruiters/corporates (who never earn points in this spend-only economy) qualify on **cumulative lifetime points spent**. Both are monotonic, historical counters — never reduced by spending points down or by a balance running low — so neither is a redeemable balance; this is what reconciles the "corporates and individuals" promise with a recruiter economy that has no earn mechanism, and it's a *stronger* legal position than the prior vague language, not a weaker one. The benefit itself is a discount code the user redeems by paying the vendor directly on the vendor's own payment page — JumpOnBoard never touches payment, so there's no stored value or payment nexus to wall off from the points ledger. Legal status downgraded to **confirmation-only** conditional on those facts holding — see DESIGN.md §7b, LEGAL_REVIEW.md for the residual risks (affiliate/referral disclosure, discount-claim advertising rules, loyalty-branding/jurisdiction rules). Regulated financial benefits remain future-roadmap beyond this.

- **External Loyalty Partner Bridge (dual-credit model, far roadmap — not an active initiative, no partner outreach yet)**: a directional idea, prompted by researching how OpenRice's Asia Miles integration actually works — it turns out OpenRice does **not** convert its own points into Asia Miles at all; the two are separate ledgers with no transfer either way, and Cathay Pacific instead **independently credits its own Asia Miles** for qualifying actions taken on OpenRice's platform. J.O.B.'s version of this would follow the same shape: a partner (e.g. an airline or hotel loyalty programme) independently awards its own currency; **J.O.B.'s points ledger is never debited, converted, or exchanged** — there is no conversion rate between J.O.B. points and any partner currency, ever. Available to both seekers and recruiters, and deliberately **independent of Benefits/Loyalty tier** (it triggers off the qualifying event itself, not off reaching a tier first). Two trigger tiers, kept clearly separate because they sit in different legal buckets (see §11):
  - **Near-term concept**: a subscription-based bonus — Pro seekers and paid recruiter tiers earn partner miles on each renewed subscription period. This is a **retention sweetener on a payment already being made**, not an earn-by-participating loop — it must not be read as resolving the recruiter flywheel gap (§6a).
  - **Future, infrastructure-gated**: activity-based crediting (a successful placement, a reveal-accept) — deferred until end-to-end placement-outcome tracking exists, which it does not today; not to be implied as buildable now.
  Partner data sharing (name, email, or a partner-loyalty-account number) requires a new, explicit, separate opt-in consent — same shape as the existing market-signals/comp-data consents (off by default, its own plain-language explainer) — and, for a cross-border partner (e.g. crediting a Hong Kong-based airline for a Singapore-based seeker), rides the existing cross-border PDPA/PDPO transfer posture (§11), not just a UI consent toggle.
- **Contextual advertising (later-stage)**: contextual only — no behavioral/individual tracking, no PII to advertisers (DESIGN.md §7c).

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

Job supply for Day 1 (cold-start): scraping Indeed was considered and rejected — its Terms of Service prohibit automated access, and breach-of-contract exposure survives the CFAA's public-data carve-out regardless of the ads being publicly searchable (see DESIGN.md §2b for the full legal reasoning, including why "Google for Jobs does this" doesn't transfer either). Instead: automated discovery from employer-operated ATS public APIs (Greenhouse/Lever) and `schema.org/JobPosting`-marked career pages feeds a private staging pipeline; nothing goes live for candidates until the employer explicitly consents via a one-time claim link. Claiming is always free — the paid ask (Pro/Enterprise) is deferred until the employer has experienced a real match, the same sequencing already used for headhunters below, now applied to this path too. On the candidate side, two no-primary acquisition hooks run in parallel: a "check a job you found" reverse-match tool (candidate pastes a job description they're personally interested in — text only, never a URL we fetch) and the free AI resume rewrite; either builds a candidate's profile as a side effect without requiring marketplace liquidity to exist first. Public signups don't open until a launch-readiness gate is met (target: ~50 candidate profiles + ~15 consented employer postings — see VISION.md), so early real users see solid matches from day one instead of an empty pool.

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

**Redemption breadth, and how the two adjacent items now sit relative to it (updated 2026-07-21 — see MEMORY.md)**: the single-purpose/closed-loop exemption this relies on assumes redemption stays narrow (our own services). Separately, the reveal-override flow (recruiter pays cash-purchased points → candidate is compensated in points regardless of outcome) routes cash-origin value from one party to another through the platform, which stresses the "non-transferable" premise — left as-is under the general parallel-review timeline (not currently blocking).

**AI-Credit Marketplace (§3 pillar 5)** — no longer a hard blocker. Its original design redeemed points for general-purpose compute usable with arbitrary third-party agents, a materially broader redemption surface than "AI resume rewriting" and closer to fungible value than a single-purpose facility. It has since been **scope-narrowed to career/JOB-related AI tasks only** (see DESIGN.md §7), which is what brings it back within single-purpose redemption logic — self-hosting the compute was never itself the answer to the breadth objection, only genuinely restricting what the key can be used for is. Legal status: **confirmation-only**, conditional on that scoping being real and enforced (LEGAL_REVIEW.md). General-purpose AI-infrastructure reselling — the shape the original design had — is explicitly hived off as a separate, unscoped future business line; if ever pursued, it would need its own from-scratch hard-blocker-style review, not inherit this item's lighter status.

**Benefits/Loyalty programme (§7, DESIGN.md §7b)** — also no longer a hard blocker, because the mechanism itself changed, not just its treatment. It no longer redeems credits for real third-party goods/services at all: there is no benefit-specific credit currency to wall off. Tier eligibility is now a concrete **per-side cumulative counter** (seekers: lifetime points earned; recruiters/corporates: lifetime points spent — §7), which strengthens rather than changes the existing defense: both are monotonic historical counters, not a balance, so this formalization doesn't reopen the stored-value question. The benefit itself is a discount code the user redeems by paying the vendor directly — JumpOnBoard never touches payment. Legal status: **confirmation-only**, conditional on the no-stored-value/no-payment-nexus facts holding (LEGAL_REVIEW.md), which must also surface residual risks (affiliate/referral disclosure, discount-claim advertising rules, loyalty-branding/jurisdiction rules, cross-jurisdiction exposure for a global programme).

**External Loyalty Partner Bridge, activity-based trigger (§7, DESIGN.md §7d, far roadmap)** — a new item this revision, covering only the *future*, infrastructure-gated trigger (a partner independently crediting its own loyalty currency for a placement/reveal-accept event). Secondary-source research (law-firm commentary and public HKMA/MAS guidance summaries — not verified against primary statute text, so treat as directional, not confirmed) indicates this shape sits within an established exemption in both target markets: Hong Kong's PSSVFO Schedule 8 single-purpose exclusion extends, per commentary, to multi-purpose bonus-point/airline-mileage schemes that are non-cash and not marketed as payment; Singapore's Payment Services Act excludes "limited purpose e-money"/"limited purpose digital payment token," with MAS's own published guidance naming airline frequent-flyer miles as the canonical example. Asia Miles itself operates unlicensed across 200+ unrelated Hong Kong merchants on this basis. The discriminating factor in both regimes is that J.O.B. points never become convertible into the partner's currency — the partner credits its own currency independently; there is no exchange rate, no conversion, no path from J.O.B.'s ledger outward. Legal status: **not yet reviewed, no active initiative** — before any real partner agreement, counsel must confirm (a) the no-conversion structure holds as designed, (b) the arrangement is structured and marketed as a loyalty-to-loyalty coalition (as Asia Miles' own partner network is), not as a payment or currency-exchange service.

**External Loyalty Partner Bridge, subscription-based trigger (§7, DESIGN.md §7d, near-term concept)** — kept as a **separate** item because it is a different legal question from the one above, not a variant of it. Awarding partner miles as a bonus for paying a subscription is structurally closer to a card-rewards pattern (miles-for-cash-spend, e.g. Amex Membership Rewards) than to the activity-based loyalty exemption — not illegal on its face, but not covered by the research above either. Residual questions this needs its own review for: consumer-protection/advertising characterization of a "bonus for paying," whether it reads as a rebate-on-spend rather than a loyalty reward, and — independent of the stored-value question — the cross-border PDPA/PDPO personal-data-transfer implications of sharing a user's identity data with a foreign partner to credit them. Legal status: **not yet reviewed, no active initiative.**

**Training credits** (DESIGN.md §7a) — a separate, narrow, one-way (points→credit only) redemption instrument for JumpOnBoard's own training content, with enterprise-purchased seats segregated from personal credits. Legal status: **confirmation-only**, with the enterprise cash-purchase path flagged specifically for counsel (cash-in → held balance → later redemption is the classic prepaid/stored-value trigger pattern; narrow same-service redemption is the defense).

**Net: as of 2026-07-21, no hard blockers remain among these three items.** All three fall back to the general private-beta-plus-parallel-legal-review sequencing already used for the rest of the points system — engineering can build without waiting on counsel; only real public launch should wait for confirmation to land.

Re-identification Risk: Acknowledged as a residual, non-zero risk (see §3, Pillar 1) rather than designed around an absolute anonymity claim. Mitigated via redaction, quasi-identifier generalization, and rate-limited reveals; not eliminated.

Marketplace Leakage: Addressed via product stickiness ("hurdles, not blockers") rather than contractual restriction — per-role reveals, match-quality-tiered and same-role-discounted reveal pricing, in-platform messaging/scheduling, and contact-info gating — since a legal anti-circumvention clause or placement-fee revenue share was a dealbreaker for independent headhunters (see §3, §7).

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
| 1.3 | 2026-07-18 | §9 GTM gains the job-supply cold-start mechanism (ATS-feed/schema.org consent-gated sourcing, candidate-paste reverse-match, launch-readiness gate) — see DESIGN.md §2b for the full design and legal reasoning. |
| 1.4 | 2026-07-20 | Data-collection-as-moat thesis (within privacy-first) in §1/§6; §3 pillar 6 continuous AI resume maintenance (roadmap); §7 Data & Adjacency Revenue Lines (aggregate-signal market-intelligence with free-teaser/paid-depth + honest late-stage sequencing, credit-based Training, Benefits/loyalty on a walled-off rail, contextual-only ads); §11 extends the tokenomics hard-blocker to the benefits/loyalty rail. All new lines roadmap/not-built; mission stays hiring-core. |
| 1.5 | 2026-07-21 | Reconciled against new Claude Design mockups — two reframes replacing prior committed text: §3 pillar 5 AI-Credit Marketplace scope-narrowed to career/JOB-related tasks only (repositioned as an "AI career-assistant credit allowance"), general AI-infrastructure reselling hived off as a separate out-of-scope future line; §7 Benefits/Loyalty replaced entirely with a discount-code/no-payment-nexus model (no credit currency, activity/tenure-based tiers). Both downgraded from hard blocker to confirmation-only, alongside a new Training credit instrument (one-way, segregated balances). §7 Market Intelligence named as a standalone SKU with deferred pricing. §11 rewritten — zero hard blockers remain. |
| 1.6 | 2026-07-22 | Recruiter-side monetization designed (previously unaddressed despite recruiters being the higher-value side): §3 pillar 4 and §7 corrected — the "same-role 2nd+ reveal discount" the docs previously claimed was live was never actually implemented; replaced with the real mechanism (match-quality-tiered + same-role-discounted reveal pricing, a deliberate bid/allocation mechanism, trade-off named explicitly). §7 B2C/Prosumer restructured into three named tiers (Free / Solo / Advanced) collapsing what would have been five independent pricing levers; Solo bundles per-role spend budgeting, the new reveal-pricing model, a recruiter-initiated override reversal (flagged for counsel, LEGAL_REVIEW.md), and a newly-paid AI JD-assistant (free during MVP until now); Advanced bundles Market Intelligence (now including comp/bonus/commission/equity trend data, gated on real data-coverage before launch) and a job-post ranking-boost SKU (enterprise-only, seeker-facing "Promoted" label required), folded into the existing Enterprise tier rather than stacked as a fourth SKU. New pricing-ceiling design principle (≤~20% of a placement's commission) recorded as a heuristic only — no placement-outcome data exists to enforce it; tracking that data is long-range backlog, not in scope here. |
| 1.7 | 2026-07-23 | MAU growth-flywheel pass: new §6a states the seeker↔recruiter loop as one connected cycle (not two independent reward systems) and names its two weak links — the freshness engine (§3 pillar 6) previously earned no points, fixed via a new narrow, rate-limited "freshness confirmation" earning category; recruiter retention has no earn loop by design, left open pending validation of the pool-staleness churn hypothesis. §7 Benefits/Loyalty tier eligibility formalized as a per-side cumulative counter (seekers: lifetime points earned; recruiters/corporates: lifetime points spent) rather than vague "activity/tenure," reconciling the existing "corporates and individuals" promise with the recruiter spend-only economy. New §7 "External Loyalty Partner Bridge" (far roadmap, no active partner): dual-crediting model researched against HK/PSSVFO and SG/Payment Services Act loyalty exemptions (secondary sources — corrects an initial assumption that OpenRice converts points into Asia Miles; it in fact dual-credits, never converts); documents two trigger tiers in separate legal buckets (near-term subscription-based bonus vs. future infra-gated activity-based crediting) and flags the subscription trigger as NOT covered by the activity-based exemption research. §11 gains three entries reflecting the above. |
