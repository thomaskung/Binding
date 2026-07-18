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

---

## 2026-07-17 (MVP scaffold session)

**Decision**: Host the MVP on Cloudflare Workers (via `@opennextjs/cloudflare`) instead of Vercel; migrate to Vercel Pro only after the prototype proves out.
**Context**: Research during scaffold planning found Vercel's Hobby (free) tier explicitly prohibits commercial use — disqualifying for a revenue-intending startup — while Cloudflare Workers' free tier allows commercial use with unlimited bandwidth.
**Outcome/Lesson**: "Free tier" is not one thing — commercial-use clauses are the first thing to check, before limits. Cost of the workaround: Next 16 `proxy.ts` runs Node-only and OpenNext requires edge middleware, so the app deliberately uses the legacy `middleware.ts` convention (documented in CLAUDE.md).
**Links**: README.md (stack), CLAUDE.md (gotchas), DESIGN.md §12

**Decision**: AI serving = Modal Starter plan ($30/mo recurring credit) running open-weight models, with a deterministic stub provider as the dev/CI default behind a provider-agnostic adapter.
**Context**: Free-tier-only directive collided with the private-LLM requirement; user chose Modal's monthly credit as the pragmatic middle. Stub-first means zero AI cost/network in local dev and CI, and the walking skeleton is fully testable without any deployed model.
**Outcome/Lesson**: Adapter + stub was the right seam: the entire e2e slice passes with stub AI, and swapping to real inference is an env flag, not a refactor. One AI pass per explicit publish (never per keystroke) is the credit guardrail.
**Links**: src/lib/ai/, modal_app/README.md, DESIGN.md §12

**Decision**: Model choices updated from Llama 3.1 8B / BGE-M3 (design-time picks) to **Qwen3 8B / Qwen3-Embedding-0.6B** after a landscape re-check during scaffold planning.
**Context**: User challenged the original picks as dated. Mid-2026 checks: Qwen3 8B leads the 8B open-weight class (Apache 2.0, strong Chinese — HK market fit); Qwen3-Embedding tops the MTEB v2 open leaderboard, and the 0.6B variant is the cheapest to serve at 1024 dims.
**Outcome/Lesson**: Re-verify model choices against current leaderboards at build time, not design time — the open-model landscape turns over in months. Frontier-API line held: candidate-derived data stays on the self-hosted path, enforced by a branded type (`JDTextOnly`) plus a guardrail test, not just a comment.
**Links**: modal_app/, src/lib/ai/types.ts, tests/frontier-guardrail.test.ts

**Decision**: Walking-skeleton scope shipped: full schema+RLS up front, matching pipeline, double-opt-in reveal with real points ledger (seeded economics: recruiter 100 / reveal 10 / compensation 3 / seeker 10), profile+job management with publish-triggered re-embedding, suggest-and-approve AI refinement, in-app messaging. Deferred with tables in place: override+refunds, purchases, verified-action earning, scheduling UI, enterprise tier.
**Context**: Confirmed across five grilling rounds; "hurdles not blockers" retention design made messaging MVP-critical rather than optional.
**Outcome/Lesson**: Debugging the slice surfaced three recurring local-Supabase traps worth remembering: hand-seeded `auth.users` rows need empty-string (not NULL) token columns or GoTrue 500s; RLS policies without `GRANT` statements return 42501; and mutually-referencing RLS policies recurse — use security-definer helper functions. All three are now baked into migrations + CLAUDE.md gotchas.
**Links**: supabase/migrations/, supabase/seed.sql, e2e/smoke.spec.ts, CLAUDE.md

---

## 2026-07-17 (override + registration session)

**Decision**: Override reveal economics: 25 pts total (10 base + 15 premium), premium refunded on decline/expiry, candidate compensated 5 pts at reveal creation regardless of outcome. Disclosure = immediate (name + fit summary at payment); accept/decline gates messaging only.
**Context**: DESIGN.md §4 had the mechanics but no numbers; "nothing disclosed until accept" was rejected because then a declined override delivers nothing and a partial refund makes no sense — the base fee pays for the look, the premium pays for engagement.
**Outcome/Lesson**: Pricing a two-part fee around what was actually delivered (look vs. engagement) made the refund rule self-explanatory instead of arbitrary.
**Links**: DESIGN.md §4, src/lib/points.ts, src/app/recruiter/actions.ts

**Decision**: Override guardrails: 5/day per recruiter, 30-day re-override block after a decline, 7-day pending auto-expiry (lazy, no cron), paused profiles fully shielded, only `surfaced` matches overridable.
**Context**: A recruiter with a topped-up balance could override-spam the pool; DESIGN.md §5 promised "rate-limited reveals" without numbers; an unanswered override locked the premium forever; per-role scoping technically allowed re-overriding a candidate who just declined via a different job (harassment vector).
**Outcome/Lesson**: Every paid-access mechanic needs an abuse review pass before shipping — all four guardrails came out of one grilling round asking "how would a hostile recruiter use this?"
**Links**: DESIGN.md §4, src/lib/points.ts (guards), MEMORY.md this entry

**Decision**: Dual-role accounts — seeker and recruiter are independent, both opt-in; header switcher; `/` remembers last-used role via cookie; single shared points balance (+10 seeker / +100 recruiter activation seeds); self-match exclusion in matching RPCs.
**Context**: User first proposed seeker-first (everyone starts as seeker, recruiter as upgrade), then self-corrected when asked about pure agency recruiters: "I was wrong. Better to have two roles separated and both require opt-in."
**Outcome/Lesson**: Grilling caught a requirements error the requester themselves flagged once the edge case (pure recruiters forced through seeker signup) was named. The self-match exclusion also only surfaced because dual-role made "recruiter reveals their own profile" possible.
**Links**: DESIGN.md §2a, migration 0004, src/lib/auth.ts

**Decision**: Consent capture shipped with registration: seekers must accept ToS + explicit AI-processing consent before any upload; recruiters accept ToS; timestamps + consent_version stored (placeholder text pending legal review).
**Context**: DESIGN.md §5 required consent covering the redaction process itself (PDPA/PDPO) but nothing captured it — the walking skeleton was collecting resumes with zero documented consent.
**Outcome/Lesson**: Compliance requirements written in design docs don't exist until a schema column and a required checkbox exist. Versioning consent from day one is nearly free; retrofitting it isn't.
**Links**: DESIGN.md §2a/§5, src/lib/consent.ts, migration 0004

**Decision**: Recruiter identity (display name + company) is readable by all signed-in users, required at recruiter activation, shown on job cards and thread headers. Unverified for MVP (verification on roadmap). Company set once at opt-in — no edit UI yet (known limitation).
**Context**: Candidates previously had no way to know who was contacting them — a basic trust failure discovered while building the override card ("[who?] revealed your profile").
**Outcome/Lesson**: The pseudonymity in this product is deliberately asymmetric: candidates are pseudonymous, recruiters are identified. That asymmetry is the trust model — worth stating explicitly in the design rather than leaving implicit.
**Links**: DESIGN.md §2a, migration 0004 (profiles_recruiter_identity_select policy)

---

## 2026-07-18 (dev-server CORS bug)

**Decision**: Added `allowedDevOrigins: ["127.0.0.1", "localhost"]` to next.config.ts.
**Context**: User accessed the dev server via `http://127.0.0.1:3000` (matching Supabase's local URLs) and reported "Create account does not work" on the new /signup page — typing an email and clicking the button silently did nothing, no error shown. Root cause was not a signup bug at all: Next.js blocks cross-origin dev-resource requests by default, so the `/_next/webpack-hmr` websocket failed from `127.0.0.1`; the dev client's reconnect/recovery path was forcing full page reloads, silently wiping the signup form's React state mid-interaction. Confirmed via console logs showing two "Download React DevTools" messages (one per full page load) instead of one, and zero network requests to Supabase's `/auth/v1/otp` endpoint.
**Outcome/Lesson**: When a form "does nothing" with no console error and no network request, suspect a full page reload wiping client state before suspecting the form's own logic — check for duplicate page-load markers in console history. `localhost` and `127.0.0.1` are different origins to a browser even though they resolve to the same machine; local dev URLs should be consistent, or `allowedDevOrigins` set defensively. Verified fix by checking Mailpit's REST API (`http://127.0.0.1:54324/api/v1/messages`) directly rather than only trusting the UI's "Check your email" status message.
**Links**: next.config.ts, DESIGN.md §12

---

## 2026-07-18 (job-supply cold-start redesign)

**Decision**: Scraping Indeed for job postings, considered and rejected.
**Context**: Founder asked whether the reasoning "job ads are public and searchable, so scraping them is fine" would hold up. Research: no. CFAA protection for scraping public data is real (*hiQ Labs v. LinkedIn*) but only defeats one specific legal theory (federal computer-fraud) — it does not touch breach-of-contract exposure under a site's own ToS, which is a separate, live theory. Indeed's ToS explicitly prohibits automated access; LinkedIn won a 2026 breach-of-contract case against scraper Proxycurl/Nubela on exactly these grounds (same industry, same pattern); Indeed has the same contractual teeth and no public read-API (Publisher API deprecated 2023). Aside: the research subagent's tool output contained an embedded prompt-injection attempt — text styled as a "system coordinator" message asking about progress, planted inside a web search result. The subagent correctly identified it as untrusted content from a scraped page (not a real instruction) and continued the actual task; flagged here for the record, not because it changed anything.
**Outcome/Lesson**: "The data is public" is a common but incomplete legal argument — it answers the CFAA question and leaves the contract-law question completely open. When evaluating a "can we just scrape X" idea, check both independently; a favorable CFAA answer is not a green light on its own.
**Links**: DESIGN.md §2b, BUSINESS.md §9

**Decision**: "Google for Jobs does this, so it must be fine" — rejected as reasoning, even though the underlying mechanism it points to (schema.org/JobPosting markup) is legitimately reusable.
**Context**: Follow-up research into why Google can display jobs from LinkedIn/JobsDB/company career pages at scale, legally. Found two separate things: (1) Google indexes listings that carry `schema.org/JobPosting` structured data employers/boards voluntarily embed — this part transfers, it's the same opt-in-signal logic as an ATS public API; (2) Google also benefits from a distinct legal privilege — courts give general-purpose search engines meaningfully more fair-use latitude than vertical commercial aggregators (*Field v. Google*, *Perfect 10 v. Amazon*), and a vertical matching platform doing the identical technical thing is legally closer to *AP v. Meltwater*, where a commercial aggregator lost specifically for substituting the source rather than complementing it.
**Outcome/Lesson**: A working legal precedent for one type of actor (a general search engine) doesn't automatically extend to a different type of actor (a commercial vertical product) doing the same technical action. When citing "X does this and it's legal" as justification, check whether the precedent's reasoning depended on X's specific legal category, not just the technical behavior.
**Links**: DESIGN.md §2b

**Decision**: Adopted a two-stage, consent-gated job-supply pipeline as the legitimate alternative — ATS public APIs (Greenhouse/Lever first) + schema.org markup discovery into private staging, promoted to live only after employer consent via a free, one-time claim link; paid ask deferred to post-match experience.
**Context**: Solving the redistribution-consent gap the ATS research surfaced (Greenhouse's own MSA restricts third-party redistribution independent of the employer's wishes) — automated discovery alone isn't safe to publish from, regardless of how public-intent the source API is.
**Outcome/Lesson**: "The employer chose to expose this" and "we are allowed to redistribute it" are two different questions — the second one needs its own explicit yes, which is why staging (never shown to candidates) sits between discovery and anything candidate-visible.
**Links**: DESIGN.md §2b

**Decision**: Candidate-paste reverse-match ("check a job you found") is text-first, and that's the *only* mode — never a URL the server fetches.
**Context**: Raised as a real technical/legal double-bind: if a candidate pastes a URL behind a login or paywall (common — LinkedIn job posts, premium boards), the server can't fetch it anyway, and building a URL-fetcher at all reopens the exact scraping-legality question already closed for Indeed, now against an arbitrary third site's ToS.
**Outcome/Lesson**: Solving a technical limitation (can't fetch paywalled content) and a legal-risk question (don't build a general-purpose fetcher) turned out to be the same fix — requiring the human to paste what they can already see. Worth checking whether other "just fetch it automatically" feature ideas have a similar single-fix overlap before building the fetcher.
**Links**: DESIGN.md §2b

**Decision**: Explicit launch-readiness gate — public signups don't open until ~50 candidate profiles AND ~15 consented/claimed employer postings exist (targets adjustable) — distinct from the Oct 2026 build/ship date.
**Context**: Founder pushed back that a shipped app with no real matches isn't actually solving cold-start; a calendar date alone doesn't guarantee liquidity exists when the door opens.
**Outcome/Lesson**: Separating "when we ship" from "when we let the public in" turns an aspirational claim ("solid matches from Day 1") into an enforceable precondition. VISION.md now tracks both independently.
**Links**: VISION.md Phase 1, DESIGN.md §2b
