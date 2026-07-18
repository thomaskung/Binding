# VISION.md — JumpOnBoard (J.O.B.) Goals & Evaluation

**Version 1.0** · Last updated 2026-07-17 · Revision history at the end of this document.

Companion to [BUSINESS.md](./BUSINESS.md) (strategy/pitch) and [DESIGN.md](./DESIGN.md) (architecture). This document defines what success looks like and how we'll measure it, so decisions have a shared reference point instead of being re-litigated each time.

## Mission

Build a privacy-first, AI-driven hiring ecosystem for APAC (HK/SG) that lets professionals and companies match on skills and compensation fit before identities are revealed — replacing salary-anchoring and cold-outbound recruiting with consent-first, trust-minimizing matching.

## North Star Metric

**Reveal-to-engagement conversions**: the count of Reveal Requests (standard or override) that result in a sustained in-platform conversation (≥1 message exchange or a scheduled interview). This is chosen over raw match count or MRR alone because it captures the thing the whole product design is built around — getting past the trust barrier — without yet requiring a placement/hire signal, which lags too far behind day-to-day product health to steer by.

## Two Timelines (kept explicitly separate — do not conflate)

**Shipping timeline** (solo-founder, AI-assisted build pace):
- Prototype: within July 2026
- Public MVP push: ~October 2026 (~3 months out)
- First user sign-ins: by end of 2026
- AI-Credit Marketplace: first fast-follow feature immediately after MVP (see DESIGN.md §7)

**Breakeven timeline** (revenue/financial — see BUSINESS.md §10 for the full model):
- Upside case: $10K MRR breakeven by Month 9 post-launch (10 enterprise + 30 headhunters + 100 pro seekers)
- Base case: same milestone at Months 18-24 post-launch, grounded in real B2B enterprise sales-cycle (6-18mo) and two-sided-marketplace cold-start benchmarks
- Base case is the plan of record for cash-runway/hiring decisions; upside case is the stretch goal in investor materials

## Phased OKRs (base-case timing)

**Phase 1 — Supply-Side Dark Pool (Months 1-3 post-MVP)**
- Objective: prove candidates will maintain a pseudonymized profile without the AI-Credit Marketplace live yet.
- KR: reach 200 active, matchable candidate profiles by Month 3 (provisional hypothesis, not a validated benchmark — revisit and reset once the first cohort's real signup/activation data exists).
- KR: ≥50% of active profiles complete at least one AI-verified action (skill assessment or work-history verification) per month (provisional target — same caveat).

**Phase 2 — Headhunter Empowerment (Months 4-9)**
- Objective: convert free headhunters to Pro via genuine reveal-to-reply experience.
- KR: reveal-to-engagement conversion rate on standard (opt-in) reveals ≥15% (provisional target — cold-outbound baselines like LinkedIn-style cold messaging are commonly cited at low single-digit reply rates, so this is set as a multiple of that, not derived from our own data yet).
- KR: 30 Pro Headhunter subscribers ($99/mo) by end of Phase 2 (base-case pacing).
- KR: AI-Credit Marketplace ships and reaches initial adoption among free + Pro seekers; track $-cost-per-active-user against the modeled cap from day one — this is real, variable COGS, not a sunk infra cost.

**Phase 3 — Enterprise Rollout (Months 10-24)**
- Objective: convert headhunter-driven traction into direct enterprise sales.
- KR: 10 Enterprise seats/contracts by Month 18-24 (base case).
- KR: Enterprise commission model (BUSINESS.md §7) validated against at least a handful of real placements, informing final percentage tiers.

## Evaluation Cadence

Monthly review of:
- **Activation**: new seeker signups, % completing profile + Dealbreaker Matrix
- **Match liquidity**: matches surfaced per active job posting, per active candidate
- **Reveal conversion**: standard vs. override reveal volume, reveal→engagement rate, decline/refund rate on overrides
- **Retention**: seeker and headhunter monthly active rate, points balance trends
- **CAC/LTV per segment**: seeker (free/Pro), headhunter (free/Pro), enterprise
- **MRR**: against both the upside and base case trajectories
- **AI-Credit Marketplace** (once shipped): adoption rate, actual $-cost-per-active-user vs. modeled cap — escalate immediately if actual cost trends materially above model, since this is the one line item with genuinely open-ended usage risk (agents can run autonomous loops)

## Kill-Criteria / Pivot Triggers

- If candidate-side liquidity (active, matchable profiles) is not on track toward the Phase 1 threshold by Month 4, reassess the supply-side acquisition strategy before investing further in headhunter-side GTM — research consistently shows two-sided marketplaces fail on the supply side, not demand, so this is the metric to protect first.
- If reveal-to-engagement conversion does not meaningfully beat cold-outbound baselines by end of Phase 2, the core value proposition (privacy-first matching beats cold messaging) needs re-examination before scaling spend.
- If AI-Credit Marketplace actual cost-per-user consistently exceeds the modeled $-cap by a wide margin after the first full billing cycle, pause new allowance grants and re-tune caps before continuing rollout — don't let a subsidized perk quietly become an uncapped liability.

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-17 | Initial: mission, north star, dual shipping/breakeven timelines, phased OKRs, cadence, kill-criteria. |
