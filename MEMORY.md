# MEMORY.md — Execution Lesson Log

Append-only log of founding decisions: what was decided, why, and what we learned once it played out. Purpose: don't re-litigate settled questions, and track which assumptions get falsified so future decisions account for it. New entries go at the bottom, in date order. Each entry links to the doc section it affects.

Format per entry: **Date** / **Decision** / **Context** / **Outcome-or-Lesson** / related doc links.

---

## 2026-07-17

**Decision**: Redesigned the tokenomics/credits system from a cash-purchasable, real-world-voucher-redeemable model to a closed-loop, non-monetary points system.
**Context**: Research flagged that the original design (recruiters buy credits with cash, candidates redeem for real-world vouchers) likely triggers Singapore's Payment Services Act (e-money licensing) and Hong Kong's MSO/SVF licensing — 3-6 months of delay plus AML/KYC infrastructure neither wanted nor budgeted.
**Outcome/Lesson**: Closed-loop, single-purpose points (redeemable only for platform services) is the standard exemption pattern under both regimes. T&Cs must explicitly state non-transferable/non-cash-redeemable to preserve it — this is a compliance-load-bearing sentence, not boilerplate.
**Links**: BUSINESS.md §3/§7/§11, DESIGN.md §6

**Decision**: Dropped the "zero re-identification risk" / fully anonymized claim in favor of "pseudonymized, defense-in-depth."
**Context**: Current re-identification-attack literature (quasi-identifiers, stylistic fingerprinting, LLM-agent re-id attacks) shows this claim doesn't hold up, and PDPA/PDPO both treat re-identifiable data as personal data regardless of redaction effort.
**Outcome/Lesson**: Overclaiming anonymity is a legal and reputational liability, not just a marketing inaccuracy — the honest framing (managed risk, layered mitigations) is also the legally defensible one.
**Links**: BUSINESS.md §3/§11, DESIGN.md §5

**Decision**: Split the breakeven timeline into an 18-24 month base case and a 9-month upside case, instead of presenting only the aggressive number.
**Context**: Enterprise B2B sales cycles run 6-18 months and two-sided marketplaces most commonly fail on supply-side liquidity before demand-side monetization becomes binding — the original 9-month target didn't account for either.
**Outcome/Lesson**: A financial plan with no downside case reads as unsophisticated to investors. Keep the ambitious number as the stated upside, but plan cash runway against the base case.
**Links**: BUSINESS.md §10, VISION.md (Two Timelines)

**Decision**: Deferred Cantonese/Singlish LLM fine-tuning to a Month 12+ roadmap item; MVP relies on base open-weight models + prompt engineering + RAG.
**Context**: Fine-tuning compute is cheap (~$1-5/run) but corpus curation is the real cost (~$5-15K, 3-6 months) — not worth front-loading before product-market fit, when prompting/RAG gets most of the value anyway.
**Outcome/Lesson**: Don't over-invest in a differentiator before there's a product to differentiate. Revisit once real APAC usage data exists to justify the corpus-building cost.
**Links**: BUSINESS.md §6/§8, DESIGN.md §8

**Decision**: Corrected the stated TAM from $39.9B to ~$16-20B; flagged SAM/SOM as needing independent validation.
**Context**: The original figure appears to have conflated the broader HR technology/services market with the narrower SaaS software segment actually being competed in.
**Outcome/Lesson**: An easily fact-checked wrong number in a pitch deck costs more credibility than a smaller, defensible one gains in impressiveness. Always cite the segment-matched source.
**Links**: BUSINESS.md §5

**Decision**: Built the reveal/leakage mitigation around product stickiness ("hurdles, not blockers") — per-role reveals, same-role multi-candidate discounts, contact-info gating, mandatory in-platform messaging/scheduling — instead of a legal anti-circumvention clause or placement-fee revenue share.
**Context**: A revenue-share or contractual lock-in was a stated dealbreaker for independent headhunters, who won't give up commission on top of a platform fee.
**Outcome/Lesson**: When a legal/contractual retention mechanism is rejected by a key user segment, the fallback isn't "no retention strategy" — it's making the product itself the reason to stay. This became a real design pillar (BUSINESS.md pillar 4), not just a risk mitigation footnote.
**Links**: BUSINESS.md §3/§7/§11, DESIGN.md §4

**Decision**: In-app messaging and interview scheduling are MVP scope, not deferred.
**Context**: The whole leakage-mitigation strategy depends on recruiters staying in-platform for contact — that only works if messaging exists from day one.
**Outcome/Lesson**: A retention mechanic that depends on a feature being present has to ship with that feature, not before it "if there's time."
**Links**: BUSINESS.md §8/§9, DESIGN.md §1/§4

**Decision**: Revenue model is pure fee-for-access (reveal fees + subscription) for independent headhunters, with no success/placement fee for that segment; Enterprise carries a tiered, negotiable commission instead.
**Context**: Fee-share was a dealbreaker for independent headhunters specifically; enterprise clients don't have the same "giving up my own commission" objection.
**Outcome/Lesson**: Don't apply one monetization model uniformly across segments with different economics and different objections — segment-specific pricing logic needs to be a first-class part of the data model (DESIGN.md §10), not a business-side afterthought.
**Links**: BUSINESS.md §7, DESIGN.md §10

**Decision**: Points earning is gated behind AI-verified quality actions (skill assessment pass, verifiable work-history signal) rather than raw profile-field edits.
**Context**: An unrestricted earn mechanism invites low-effort profile farming purely to harvest free redemptions.
**Outcome/Lesson**: Any "earn points for activity" mechanic needs a quality gate from day one — retrofitting fraud prevention after abuse patterns emerge is much more expensive than designing the gate in from the start.
**Links**: BUSINESS.md §3, DESIGN.md §6

**Decision**: Reveal system uses a default double opt-in (candidate must express interest first) with a paid recruiter override path — partial refund to recruiter on decline, points compensation to candidate regardless of outcome, and a per-candidate toggle to disable override entirely.
**Context**: Needed to balance recruiter demand for reach against candidate privacy/consent — a pure opt-in-only model risks too much friction (jobs with genuinely no candidate-side interest never get filled), while a pure passive-reveal model undermines the whole privacy-first pitch.
**Outcome/Lesson**: "Configurable, privacy-first-by-default" resolved a real tension better than picking one extreme — this is now a distinct subsystem (two reveal paths, refund logic, compensation logic, a privacy toggle), not a one-line feature, and needed its own DESIGN.md section.
**Links**: BUSINESS.md §3, DESIGN.md §4

**Decision**: Domain strategy is `jumponboard.hk` / `jumponboard.sg` for MVP, with `.com` acquisition deferred to post-seed/Series A funding. Legal entity is a Singapore holding company with SG and HK operating companies, with tax-haven redomiciling deferred to Series A+.
**Context**: The `jumponboard.com` domain belongs to a now-defunct, unrelated company (via HugeDomains resale listing) — not a live trademark conflict, but also not worth spending pre-seed capital to acquire immediately.
**Outcome/Lesson**: Sequence non-critical-path spending (domain acquisition, entity redomiciling) to funding milestones rather than front-loading it before there's capital to spend without denting runway.
**Links**: BUSINESS.md §12

**Decision (the AI-Credit Marketplace pivot)**: What started as a vague "points can fund LLM API usage for agents like Hermes/OpenClaw" aside was concretized into a real fast-follow feature: an open, OpenAI-compatible API key, metered by dollar-value cap against cheap open-weight models only, funded by points, with free/Pro allowance tiers — shipping immediately after MVP, not on day one.
**Context**: The job-seeker incentive-to-maintain-profile problem was real (a genuine cold-start risk flagged by research), and "AI resume rewriting credits" alone wasn't judged attractive enough. Research confirmed **OpenCode Go** is a real $10/mo product doing exactly this pattern (dollar-value caps, OpenAI-compatible, explicitly compatible with **Hermes Agent** and **OpenClaw**, both real general-purpose autonomous agent frameworks with 145-180K+ GitHub stars) — external validation this is a real, already-monetized pattern, not a hypothetical.
**Outcome/Lesson**: An open API key usable with any third-party agent (including ones that run autonomous, unattended loops) is a materially bigger cost/abuse surface than a scoped-down, JumpOnBoard-only AI feature — accepted deliberately as a tradeoff for differentiation, but only with a hard dollar-cap gateway and open-weight-models-only as the guardrail, and only as a fast-follow (not MVP) so real usage data exists before sizing the caps. Watch actual $-cost-per-active-user against the modeled cap from the day this ships — this is the one cost line with genuinely open-ended risk.
**Correction (same day, caught on review)**: this pivot quietly undermines the tokenomics licensing exemption logged above. That exemption assumes redemption stays single-purpose/narrow; redeeming points for general-purpose third-party compute is a much broader redemption surface, and the reveal-override flow (cash-purchased points → candidate compensated in points regardless of outcome) routes cash-origin value between parties, stressing the "non-transferable" premise. Lesson: when a later decision changes what an earlier decision's redemption/value-flow assumptions were, re-check the earlier decision's reasoning explicitly — don't assume it still holds just because nothing directly contradicted it. Flagged as a specific pre-launch legal-review item, not just folded into the general "not legal advice" caveat.
**Links**: BUSINESS.md §3 (pillar 5), §11, DESIGN.md §6/§7, VISION.md (evaluation cadence)

**Decision**: Escalated the AI-Credit Marketplace exemption question from "flagged for review" to a hard launch blocker, and produced [LEGAL_REVIEW.md](./LEGAL_REVIEW.md) — a fact summary and specific question list for SG/HK counsel — rather than just noting "consult a lawyer" inline.
**Context**: A flag buried in a risk-management section is easy to silently slip past once the feature is otherwise ready to ship; a named, separate briefing document with the exact mechanism and exact questions makes the review actionable and makes the blocker hard to miss.
**Outcome/Lesson**: When a compliance question is specific enough to have concrete sub-questions, write them down for counsel rather than leaving "get this reviewed" as a vague to-do — it's the difference between a blocker someone can actually act on and one that gets rationalized away under launch pressure.
**Links**: LEGAL_REVIEW.md, BUSINESS.md §11, DESIGN.md §7
