# Binding — Demo Q&A / Objection Handling

Grounded answers for the predictable hard questions from a Cyberport-CCMF assessor or an investor. Each answer maps to the strategy docs; keep them honest (the reconciled docs won't contradict you). Draft — refine with the founder's voice.

## "Why won't LinkedIn just crush you?"

We don't compete with LinkedIn's scale — we compete on a thing its model structurally can't do: **matching on skills + compensation before identity is revealed.** LinkedIn's value *is* the identified public profile; ours is the opposite — a privacy-walled dark pool of passive talent who won't touch a public platform because of retaliation and payslip anchoring. We empower headhunters (LinkedIn's own customers) rather than out-reach LinkedIn's candidate volume, which this stage can't win on. (BUSINESS.md §1 "Our Stance on Agencies", §6.)

## "Two-sided marketplace cold start — where does supply come from?"

Named as the hardest problem (VISION.md). Two answers: (1) the launch-readiness gate — we don't open public signups until ~50 candidate profiles + ~15 consented postings exist, so day-one users see real matches; (2) for the beta this is **manual concierge** — hand-seeded postings + outreach — not an automated pipeline yet. The ATS/schema.org discovery pipeline (§2b) is designed and consent-gated but deferred; it's a scale accelerant, not a beta dependency. Honest: supply is the risk, and we're de-risking it by gating launch on density, not a calendar date.

## "Solo founder — execution risk?"

Solo founder building with AI coding agents ("vibe coding"). The working prototype you just saw — real AI matching, the full reveal economy, privacy controls, staging CI/CD — is the evidence that this execution model ships. The CCMF grant funds incorporation + the HK edge-layer R&D within the grant window. (BUSINESS.md §8/§12; the 20 hrs/week commitment is stated transparently, not hidden.)

## "Is 'privacy-first' real, or marketing?"

Demonstrable, not claimed — and deliberately *not* over-claimed. We say **pseudonymized + defense-in-depth, not anonymous**: pseudonymized data that could in principle be re-identified is still personal data under PDPA/PDPO, and we design around that (consent, retention, cross-border posture) rather than an anonymity exemption. What's live: redaction-before-embedding, Layer-0 client-side contact strip, owner-only RLS on raw resumes, k-anonymity (≥20) suppression on aggregates, append-only PII access audit, built account deletion. The embedding-inversion risk is documented and mitigated (redact-first bounds it). (DESIGN.md §5/§2f, BUSINESS.md §11.)

## "Liability if the AI redaction misses a name?"

Redaction is best-effort LLM work backed by deterministic Layer-0 pattern stripping for contact identifiers, and identity is *never* carried by free resume text to recruiters — it flows only through the consent-gated, paid, audited reveal channel (`profiles.display_name`). So a redaction miss doesn't leak identity into the recruiter surface. We disclose the residual re-identification risk rather than guaranteeing zero. (DESIGN.md §2f Layer-0↔reveal reconciliation.)

## "Why now?"

Serverless private LLM economics (Modal/Qwen3, pennies per inference) removed the infra barrier to running sandboxed private models; APAC professionals are actively pushing back on salary disclosure; post-ZIRP HR budget cuts make cheaper sourcing urgent for headhunters. (BUSINESS.md §4.)

## "What's the moat once you have traction?"

The **continuously-maintained, structured, fresh APAC career dataset** — far harder to replicate than a one-time scrape of stale profiles, and the raw material for the aggregate market-intelligence line. The reveal economy + in-platform messaging create switching cost (product stickiness, "hurdles not blockers", since a legal anti-circumvention clause was a dealbreaker for headhunters). (BUSINESS.md §6/§6a.)

## "How do you make money — I didn't see a payment step?"

Correct — billing is deliberately deferred for this stage; the demo is points-only. The revenue model is designed (Pro seeker $9.99, Solo recruiter $99, enterprise $599, reveal top-ups) but not yet wired to a processor. The current milestone validates product + matching quality, not willingness-to-pay. (BUSINESS.md §7 build-state note.)

## "Regulatory / tokenomics risk on the points economy?"

The points system is closed-loop, non-monetary, non-transferable, non-cash-redeemable — designed to stay outside SG Payment Services Act / HK SVF-MSO licensing. Adjacencies (AI-Credit allowance, Benefits discount-codes, Training credits) were each reviewed and are confirmation-only, not hard blockers; the reveal-override cross-party points flow is flagged for counsel. Formal SG/HK review runs in parallel with the private beta. (BUSINESS.md §11, LEGAL_REVIEW.md.)

## "Hong Kong nexus for the grant?"

HK opco owns, develops, and hosts the **edge layer** (redaction pipeline, HK regional store, HK GPU serving) — that's the HK-domiciled, ESS-claimable R&D. HK-fintech beachhead, HK market data, getbinding.com. The grant ladder is CCMF/HKSTP Ideation → incubation → ESS at Series-A (ESS is 1:1 matching, not pre-seed). (BUSINESS.md §9a, DESIGN.md §2f.)
