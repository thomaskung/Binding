# LEGAL_REVIEW.md — Briefing for SG/HK Counsel: Points Economy & AI-Credit Marketplace

Not legal advice — this is a fact summary and question list to hand to actual Singapore/Hong Kong counsel. Nothing in BUSINESS.md, DESIGN.md, or MEMORY.md should be treated as a final compliance position until this review is complete. See those docs for full product context.

## Status

**Hard blocker**: the AI-Credit Marketplace feature (BUSINESS.md §3 pillar 5, DESIGN.md §7) does not ship until counsel has signed off on the specific exemption question below. This is stricter than the general "private beta + parallel legal review" approach for the rest of MVP (BUSINESS.md §11) — the rest of the points system can launch under that lighter sequencing; this one feature cannot.

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

General PDPA/PDPO data-privacy review (candidate data, retention, cross-border transfer) is a separate, already-flagged item (BUSINESS.md §11, DESIGN.md §5) and can proceed on the lighter "private beta + parallel review" timeline. This document is scoped specifically to the points/tokenomics licensing question.
