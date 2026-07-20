# LEGAL_REVIEW.md — Briefing for SG/HK Counsel: Points Economy & AI-Credit Marketplace

**Version 1.1** · Last updated 2026-07-20 · Revision history at the end of this document.

Not legal advice — this is a fact summary and question list to hand to actual Singapore/Hong Kong counsel. Nothing in BUSINESS.md, DESIGN.md, or MEMORY.md should be treated as a final compliance position until this review is complete. See those docs for full product context.

## Status

**Hard blocker**: the AI-Credit Marketplace feature (BUSINESS.md §3 pillar 5, DESIGN.md §7) does not ship until counsel has signed off on the specific exemption question below. This is stricter than the general "private beta + parallel legal review" approach for the rest of MVP (BUSINESS.md §11) — the rest of the points system can launch under that lighter sequencing; this one feature cannot.

**Second hard blocker (added 2026-07-20)**: the credit-based **Benefits/Loyalty programme** (BUSINESS.md §7, DESIGN.md §7b) does not ship until counsel has completed the dedicated stored-value analysis in Part 2 below. It is deliberately built on a credit rail walled off from the points ledger; the review must confirm that wall holds. Same hard-blocker status as the AI-Credit Marketplace.

## The mechanism, as designed

1. **Points are earned** by job seekers via AI-verified actions (skill assessment pass, work-history verification) and automatically whenever their profile is revealed (accepted or declined by the candidate).
2. **Points are purchased with cash** by recruiters/enterprises (e.g. "$15-20 per Reveal Request," subscription bundles).
3. **Points redeem for**:
   - AI resume rewriting (JumpOnBoard's own service — narrow, single-purpose).
   - **AI-Credit Marketplace allowance**: an open, OpenAI-compatible API key, usable with *any* third-party autonomous agent (e.g. Hermes Agent, OpenClaw), metered by dollar-value cap against open-weight LLM inference JumpOnBoard pays for on the user's behalf. This is general-purpose compute, not a JumpOnBoard-branded feature.
4. **Cross-party value flow**: in the reveal-override path, a recruiter pays points (cash-purchased) to reveal a candidate who hasn't opted in; if the candidate declines, the recruiter gets a partial refund, but the candidate is compensated in points regardless of outcome. Cash-origin value effectively moves from the recruiter's purchase to the candidate's balance via the platform.
5. **Terms of service** are drafted to state points are non-transferable and non-redeemable for cash or real-world vouchers.

## Why this needs specific review, not a general compliance pass

The intended design rationale (see BUSINESS.md §3/§11) is that a closed-loop, single-purpose points system — redeemable only for the issuer's own goods/services — commonly falls outside Singapore's Payment Services Act (e-money / stored value facility licensing) and Hong Kong's Money Service Operator / Stored Value Facility licensing regimes. Two aspects of the current design may stretch that premise:

- **Breadth of redemption**: "AI resume rewriting" is narrow and clearly JumpOnBoard's own service. "General-purpose compute usable with arbitrary third-party agents" is a much broader redemption surface — arguably closer to fungible value (buy points, get compute you can point at anything) than a single-purpose facility exemption is meant to cover.
- **Cross-party value transfer**: the reveal-override compensation flow routes cash-purchased value from one user (recruiter) to another (candidate) via the platform, which may stress the "non-transferable" claim the ToS relies on.

## Specific questions for counsel

1. Under Singapore's Payment Services Act, does a points system with the redemption breadth described above (item 3, especially the AI-Credit Marketplace) still qualify for treatment outside e-money/stored-value-facility licensing? What redemption-scope boundary, if any, would keep it exempt?
2. Under Hong Kong's AMLO/MSO regime and the Stored Value Facilities Ordinance, does the same mechanism trigger MSO licensing or SVF licensing, particularly given the cross-party value flow in item 4?
3. Does the reveal-override compensation mechanic (cash-purchased points → candidate compensated regardless of outcome) constitute a "transfer" that undermines the non-transferable ToS language, from a regulatory standpoint (as opposed to a contractual one)?
4. If the AI-Credit Marketplace as designed does trigger licensing exposure, what is the minimum viable redesign that would avoid it — e.g., restricting redemption to a JumpOnBoard-controlled agent/skill rather than an open API key, capping per-user $-value low enough to fall under a different threshold, or something else counsel identifies?
5. What specific ToS/consent language is required (beyond "non-transferable, non-cash-redeemable") to support whichever position counsel recommends?

## What's NOT in scope for this review

General PDPA/PDPO data-privacy review (candidate data, retention, cross-border transfer) is a separate, already-flagged item (BUSINESS.md §11, DESIGN.md §5) and can proceed on the lighter "private beta + parallel review" timeline. Part 1 above is scoped specifically to the points/tokenomics licensing question. **Exception (added 2026-07-20)**: the resume-first / data-monetization pivot generated a small set of *specific, discrete* questions (Part 2 below) that don't fit the lighter general-review sweep — two are stored-value/licensing (in this doc's original wheelhouse), two are targeted PDPA/PDPO questions about the aggregate-signal product. They are listed here concretely so counsel can answer them directly rather than folding them into the broad review.

## Part 2 — Resume-First Pivot & Data-Monetization (added 2026-07-20)

Context: DESIGN.md §2c-§2e and §7a-§7c, BUSINESS.md §1/§7. The product is pivoting to continuous AI resume maintenance (a persistent PII-bearing asset per user) and monetizing the resulting dataset **only in aggregate, non-identifiable form** — plus credit-based Benefits/loyalty and Training adjacencies. New questions:

6. **Aggregate signals as "personal data"**: If market-intelligence signals (in-demand skills, expected salary raises, hiring velocity) are computed only from **opt-in** profiles and only over cohorts of **≥ k distinct people** (proposed starting k≥20), with any below-threshold cohort suppressed entirely — do the published aggregates fall **outside** "personal data" under Singapore PDPA and Hong Kong PDPO? What minimum k (and what other conditions — e.g. added noise, quasi-identifier generalization) would counsel require to rely on that position in small/niche APAC verticals where re-identification risk is highest?

7. **Secondary-purpose consent for the signal product**: Is a **separate, explicit opt-in consent** (distinct from the AI-processing/redaction consent already captured at onboarding) sufficient to lawfully use a candidate's data to produce the saleable aggregates in Q6? What specific notice/consent language is required, and does the continuous-maintenance model (data kept and updated indefinitely for an active account) change the consent or retention analysis versus one-time ingest?

8. **Benefits/Loyalty stored-value analysis (hard blocker)**: The Benefits/loyalty programme (BUSINESS.md §7, DESIGN.md §7b) redeems **credits for real third-party goods/services** (flights, accommodation, IT-equipment upgrades, healthcare products; long-term a global loyalty programme). It is deliberately on a **credit rail walled off from the points ledger**. (a) Does this rail, on its own, trigger SG Payment Services Act (e-money/SVF) or HK MSO/SVF Ordinance licensing? (b) Does its mere existence within the same platform risk re-characterizing the *points* ledger as part of a broader stored-value facility, and what separation (accounting, ToS, technical, entity) is required to keep the points exemption intact? (c) Does a cross-jurisdiction "global loyalty programme" pull in additional regimes we should scope now?

9. **Contextual-ad consent posture**: For contextual-only advertising (targeted by page/role/skill context, **no** behavioral or individual-level tracking, no PII disclosed to advertisers — DESIGN.md §7c), what consent/notice posture is required under PDPA/PDPO? And if any *cohort-level* ad targeting reuses the Q6 k-anonymity threshold, does that change the answer?

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07-17 | Initial briefing: points-economy exemption facts + five questions for counsel; AI-Credit Marketplace launch blocker. |
| 1.1 | 2026-07-20 | Part 2 added for the resume-first/data-monetization pivot: Q6 aggregate-signals-as-personal-data (k-anonymity), Q7 secondary-purpose opt-in consent, Q8 Benefits/loyalty stored-value analysis (second hard blocker), Q9 contextual-ad consent. Benefits/loyalty rail flagged as a hard blocker in Status. |
