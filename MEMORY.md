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

**Decision**: Domain strategy was the working name's `.hk` / `.sg` domains for MVP, with `.com` acquisition deferred to post-seed/Series A funding. Legal entity is a Singapore holding company with SG and HK operating companies, with tax-haven redomiciling deferred to Series A+.
**Context**: The working name's `.com` belonged to a now-defunct, unrelated company (via HugeDomains resale listing) — not a live trademark conflict, but also not worth spending pre-seed capital to acquire immediately.
**Outcome/Lesson**: Sequence non-critical-path spending (domain acquisition, entity redomiciling) to funding milestones rather than front-loading it before there's capital to spend without denting runway. **Superseded 2026-08-03**: the production domain is now `getbinding.com` (purchased), replacing this `.hk`/`.sg` plan.
**Links**: BUSINESS.md §12

**Decision (the AI-Credit Marketplace pivot)**: What started as a vague "points can fund LLM API usage for agents like Hermes/OpenClaw" aside was concretized into a real fast-follow feature: an open, OpenAI-compatible API key, metered by dollar-value cap against cheap open-weight models only, funded by points, with free/Pro allowance tiers — shipping immediately after MVP, not on day one.
**Context**: The job-seeker incentive-to-maintain-profile problem was real (a genuine cold-start risk flagged by research), and "AI resume rewriting credits" alone wasn't judged attractive enough. Research confirmed **OpenCode Go** is a real $10/mo product doing exactly this pattern (dollar-value caps, OpenAI-compatible, explicitly compatible with **Hermes Agent** and **OpenClaw**, both real general-purpose autonomous agent frameworks with 145-180K+ GitHub stars) — external validation this is a real, already-monetized pattern, not a hypothetical.
**Outcome/Lesson**: An open API key usable with any third-party agent (including ones that run autonomous, unattended loops) is a materially bigger cost/abuse surface than a scoped-down, platform-only AI feature — accepted deliberately as a tradeoff for differentiation, but only with a hard dollar-cap gateway and open-weight-models-only as the guardrail, and only as a fast-follow (not MVP) so real usage data exists before sizing the caps. Watch actual $-cost-per-active-user against the modeled cap from the day this ships — this is the one cost line with genuinely open-ended risk.
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

**Decision / Correction (same week)**: Migrated from Cloudflare Workers to Vercel (Hobby tier) for staging; removed `@opennextjs/cloudflare`, `wrangler.jsonc`. Added GitHub Codespace (.devcontainer), GitHub Actions CI/CD, and staging Supabase + Modal deploys.
**Context**: The original CF Workers decision (MEMORY.md 2026-07-17 § "MVP scaffold session") was correct for a commercial-launch free tier, but the local Mac machine couldn't keep the full Docker+Supabase+Next.js stack running without thermal throttling and frequent OOM kills. The founder shifted to a Codespace-first dev workflow and a Vercel-hosted staging environment to offload compute entirely.
**Outcome/Lesson**: The CF Workers middleware constraint (`middleware.ts` instead of `proxy.ts`) was the only code-level cost, and removing it simplified the setup (no `.open-next/`, no `wrangler.jsonc`). Supabase stays free-tier hosted. Modal stays the private-AI path. The original rationale (Vercel Hobby prohibits commercial use) is still true — but staging isn't commercial launch, and the founder explicitly deferred production to post-MVP with possible re-evaluation of hosting.
**Links**: AGENTS.md (setup/CLI details — a DEVELOPMENT.md was originally referenced but never created), .devcontainer/devcontainer.json, .github/workflows/

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

---

## 2026-07-20 (resume-first pivot + data-monetization strategy)

**Decision**: Pivot the core interaction model to resume-first onboarding + continuous AI resume maintenance (suggest-and-approve), making J.O.B. the user's de-facto lifelong resume keeper. Documentation-only pass (no build), same treatment as §2b/§7.
**Context**: Founder's diagnosis: traditional profile-maintenance UI puts upkeep on the user, so free-tier candidates let profiles rot and refresh only when job-hunting — starving the passive dark pool of fresh data (the supply-side liquidity problem VISION.md already names as hardest). Fix: AI periodically asks "anything new?" and drafts updates the user approves. Stickiness moat + freshness engine.
**Outcome/Lesson**: The quiet hinge is a privacy invariant, not a UX one. First framing was wrong and advisor caught it: raw resumes are *already* retained owner-only (the `resumes` table) — the pivot does NOT start keeping something previously discarded. The accurate, narrower (and more defensible) delta: the resume goes from persisted-but-static to continuously-updated, active-account retention lengthens, and consent must now cover ongoing maintenance (not one-time ingest). "We maintain your resume" and "privacy-first" only coexist if DESIGN states plainly: raw resume stays owner-only (RLS), redaction boundary unchanged, consent/retention cover continuous maintenance. Written into DESIGN §5 so the pivot doesn't silently expand the PII surface while claiming the opposite. Lesson: when describing how a change affects privacy posture, check the *current* data model first — it's easy to overstate the delta and imply a regression that didn't happen.
**Links**: DESIGN.md §2c/§5, BUSINESS.md §1/§3/§6

**Decision**: Monetize the data as aggregate market-intelligence signals only — opt-in (separate consent) + hard k-anonymity threshold (start k≥20, suppress below it), PII never sold. Packaged free-teaser + paid-depth. Contextual-only ads (no behavioral tracking) as a later line.
**Context**: Founder framed J.O.B. as a data-collection business but insisted privacy stays the #1 priority and the moat. Grilling forced the make-or-break detail: "aggregate" is meaningless in small APAC verticals if a cohort is 3 people — that's de-facto individual disclosure. Hard k-threshold (not just "anonymized") is what makes "non-identifiable" true and is the basis for arguing the aggregates fall outside PDPA/PDPO "personal data".
**Outcome/Lesson**: Opt-in + hard k-threshold structurally starves the signal product early (pre-launch gate is only ~50 profiles), so market-intelligence revenue is late-stage, not near-term — documented honestly rather than modeled into early breakeven. The anonymity guarantee and the revenue timeline are the same constraint.
**Links**: DESIGN.md §2e, BUSINESS.md §7, VISION.md Phase 1, LEGAL_REVIEW.md Part 2 (Q6/Q7)

**Decision**: Credit-based Benefits/loyalty programme runs on a SEPARATE credit rail, walled off from the points ledger — hard legal blocker until counsel signs off.
**Context**: Founder's Benefits idea (enterprises + individuals redeem credits for flights, accommodation, IT-equipment upgrades, healthcare products; long-term global loyalty programme) is exactly the broad-redemption surface LEGAL_REVIEW already flags as breaking the closed-loop single-purpose points exemption (SG PSA / HK SVF). A global loyalty programme multiplies the exposure across jurisdictions.
**Outcome/Lesson**: The same catch as the 2026-07-17 tokenomics redesign, resurfacing via a new feature — grilling caught it before it contaminated the points ledger. Quarantine onto a distinct instrument with its own licensing analysis; the review must confirm the wall holds so the points exemption survives. Training (AI-driven quiz/learning, incl. corporate AML/security compliance) is the safer sibling adjacency — feeds the verified-action earn loop, no stored-value issue.
**Links**: DESIGN.md §6/§7a/§7b, BUSINESS.md §7/§11, LEGAL_REVIEW.md Status + Part 2 (Q8)

**Decision**: "Generative UI" resolved to adaptive/state-driven UI, not runtime-generative. LinkedIn/social import deferred entirely. Mission stays hiring-core.
**Context**: Founder asked to explore generative UI. Runtime-generative (LLM emits markup per render) is untestable-deterministically (breaks the standing unit+e2e rule), expensive, and an a11y/injection risk. Adaptive (deterministic components; a profile-state machine picks which modules surface; AI content in fixed slots) gets ~90% of the intent and stays green under Playwright. LinkedIn "sync" is the already-rejected Indeed problem (LinkedIn v. Proxycurl/Nubela 2026) — deferred; if revisited, user-uploads-own-export only, never a server fetch. Training/Benefits/loyalty/signals framed as roadmap adjacencies gated behind hiring PMF, not a mission rewrite.
**Outcome/Lesson**: "Generative UI" is two very different things; disambiguating up front avoided committing the codebase to an untestable path. The standing test convention (CLAUDE.md) is a real design constraint, not just process.
**Links**: DESIGN.md §2d/§7c, VISION.md (mission + long-horizon adjacency)

---

## 2026-07-21 (reconciling Claude Design mockups against strategy — 5 grilling rounds)

**Decision**: Reviewed 6 new Claude Design mockups (seeker-onboarding, seeker-dashboard, maintenance-nudge, market-insights-consent, market-intelligence, training-home) against DESIGN/BUSINESS. Found four real gaps: a third credit instrument invented for Training, an unpriced "Pro" gate for Market Intelligence, an unverified "MAS-aligned" regulatory claim, and the new adaptive dashboard silently ignoring the already-shipped seeker_tier match-band cap in two frames (B and D).
**Context**: The design agent, working only from the design-prompts.md briefs, filled gaps with plausible-sounding but undocumented product mechanics — exactly the risk of letting a design tool "finish" a spec that was intentionally left open.
**Outcome/Lesson**: A generated mockup is a spec-completeness test: wherever the design agent had to invent a mechanic, that's a real gap in the docs, not a design agent error. Review new mockups against strategy docs the same way code gets reviewed against a spec.
**Links**: DESIGN.md §2d, §7/§7a/§7b, .design-sync/design-prompts.md

**Decision (supersedes the 2026-07-20 "credit-based Benefits/loyalty... walled-off rail" entry above)**: Benefits/Loyalty is reframed entirely to a discount-code model — no benefit-specific credit currency at all. Tier eligibility is activity/tenure-based (mirrors existing points-earning); the benefit is a generic, non-tracked discount code; the user pays the vendor directly on the vendor's own payment page; Binding never touches payment. Applies uniformly across all categories. Legal status downgrades from hard blocker to confirmation-only.
**Context**: The 2026-07-20 entry logged Benefits as walled-off-credit-rail specifically to protect the points-ledger exemption — a real fix for the wrong shape of the problem. The founder's actual preference, surfaced only when asked directly, was to remove the credit mechanic entirely rather than merely wall it off. "Users still pay themselves, no payment nexus" turned out to be a legitimate, much cleaner resolution than quarantining a currency that didn't need to exist.
**Outcome/Lesson**: When a feature keeps generating hard-blocker-level legal flags no matter how it's walled off, ask whether the underlying mechanic (a credit/stored-value instrument) is actually necessary to the feature's value prop — here it wasn't; a pure discount-code redirect delivers the same user benefit with no stored-value exposure at all. Don't just mitigate a risky mechanic; ask if it can be removed.
**Links**: DESIGN.md §6/§7b, BUSINESS.md §7/§11, LEGAL_REVIEW.md Status + Q8 (supersedes 2026-07-20 entry's Benefits decision)

**Decision**: AI-Credit Marketplace scope-narrowed to career/JOB-related AI tasks only (classifier-gated OpenAI-compatible passthrough), downgrading from hard blocker to confirmation-only. General-purpose AI-infrastructure reselling (the original "genuinely open, any third-party agent" idea) hived off as a separate, unscoped future business line requiring its own full review if ever pursued.
**Context**: The founder's first argument for downgrading — "the AI service is our own, not third-party, so there's no payment nexus" — was caught as invalid on an advisor cross-check: the documented objection (LEGAL_REVIEW Q1, BUSINESS §11) was never about who hosts the compute, it's about redemption *breadth*. The feature's own DESIGN §7 language ("genuinely open... usable with any third-party agent... not restricted to a Binding-branded skill") directly contradicted "narrow, own-service redemption" — self-hosting a model doesn't narrow what a user can *do* with an unrestricted key. Surfaced this contradiction back to the founder rather than accepting the argument, and the founder chose the real fix: narrow the actual scope, not the framing.
**Outcome/Lesson**: "It's our own service" and "it's a narrow redemption" are different axes — a founder (or anyone) can answer the easier one while believing they've answered the harder one. When a stated justification doesn't address the specific documented objection, quote the objection back verbatim and ask again rather than accepting adjacent reasoning. This is the second time in this project a proposed legal fix mitigated the wrong dimension of a risk (see the Benefits entry above) — worth treating as a pattern to watch for specifically in tokenomics-adjacent decisions.
**Links**: DESIGN.md §7, BUSINESS.md §3 pillar 5/§11, LEGAL_REVIEW.md Status + Q1-5

**Decision**: Training credits are a real, separate, narrow-redemption instrument — one-way conversion from points only (never back), three funding sources (points-conversion, direct quiz/course earning, enterprise cash-purchased staff seats), with enterprise-assigned balances segregated from personal credits. Legal status: confirmation-only, with the enterprise cash-purchase path flagged specifically for counsel (cash-in → held balance → later redemption is the classic prepaid/stored-value trigger pattern).
**Context**: The mockup showed a "120 credits" balance with no documented backing — needed either folding into points or a real, separately-justified instrument. One-way conversion and balance segregation are what keep it clearly narrower than the Benefits mechanic that needed a full reframe.
**Outcome/Lesson**: A one-way-only conversion (never redeemable back to a more liquid instrument) is a cheap, effective way to keep a new credit instrument from reopening a fungibility question already settled for the main points ledger.
**Links**: DESIGN.md §7a, BUSINESS.md §7, LEGAL_REVIEW.md new Q10

**Decision**: Market Intelligence "paid depth" is a new, standalone SKU with pricing deferred/roadmap-only (mirrors the AI-Credit Marketplace $-cap-sizing pattern) — not bundled into existing Pro Headhunter/Pro SaaS tiers. Buyer scope stays broad (enterprises, recruiters, potentially non-hiring buyers), not narrowed, since no real buyer-interest data exists yet.
**Context**: The mockup's "Pro" badge implied an existing priced tier that BUSINESS §7 never actually specified.
**Outcome/Lesson**: Same discipline as the AI-Credit Marketplace's $-cap sizing — don't invent a price or a buyer segmentation ahead of real demand data; name the line item and defer the number.
**Links**: BUSINESS.md §7, DESIGN.md §2e

**Decision**: Match-band-cap invariant added to DESIGN §2d — any adaptive-dashboard state showing a match must reflect the shipped `seeker_tier` cap (`matchBand()`, `src/lib/matching.ts`) with zero differential signal for a capped match, across every frame that shows matches.
**Context**: The new seeker-dashboard mockup showed an uncapped "High match" badge in two separate frames (B — published/active, and D — dual-role), both silently ignoring a real, already-shipped privacy rule (`high` caps to `normal` unless `seeker_tier='pro'`). Caught during review, not by the design agent itself.
**Outcome/Lesson**: When reviewing new UI (mockup or real) against a codebase, check it against already-shipped business logic, not just the strategy docs — a design can be internally consistent and still silently regress a real, tested invariant. The dual-role frame wasn't exempt just because it also showed a different concern (role switching); reusing the same mock data source (`matchData()`) let the bug appear in two places from one root cause.
**Links**: DESIGN.md §2d, src/lib/matching.ts, .design-sync/design-prompts.md

---

## 2026-07-23 (MAU growth-flywheel analysis + points-system unification — 3 grilling rounds)

**Decision**: Named the seeker↔recruiter loop explicitly as one connected flywheel (not two independent reward systems) in new BUSINESS.md §6a. Added a rate-limited "freshness confirmation" points-earning category so the freshness-engine mechanic (§2c) finally earns points. Formalized Benefits/Loyalty tier eligibility as a per-side cumulative counter — seekers on lifetime points earned, recruiters/corporates on lifetime points spent — replacing the vague "activity/tenure-based" placeholder. Added a new far-roadmap "External Loyalty Partner Bridge" (dual-crediting model, e.g. a partner airline independently awarding its own miles) with two triggers kept in separate legal buckets: activity-based (future, infra-gated) vs. subscription-based (near-term concept, explicitly not covered by the same exemption research). Recruiter earn-loop gap (round 1's biggest cross-side finding) stays explicitly open — the subscription-miles perk is a retention sweetener, not a fix for it.
**Context**: Founder wanted the points system "unified" (Benefits/Loyalty tied to points) and asked to research HK/SG loyalty-scheme licensing so it stays clean, citing OpenRice's Asia Miles integration as the model. Research (WebSearch/WebFetch against secondary/law-firm sources — primary HKMA/MAS documents were blocked) corrected the premise: OpenRice does not convert points into Asia Miles at all — it's dual-crediting, two separate ledgers, no transfer either way. This reshaped the design toward dual-crediting instead of conversion. A first draft of the per-side tier metric ("lifetime points earned") would have silently locked recruiters out of a benefit BUSINESS.md §7 already promises them ("corporates and individuals") — caught on advisor review before writing, fixed with a per-side formula. A second advisor pass caught that the founder's follow-up idea (miles for paying a subscription) is a *different* legal bucket than the activity-based research already done (card-rewards/Amex pattern, not the airline-mileage exemption) and does not satisfy the founder's own flywheel definition on the recruiter side — both corrections were folded into the docs rather than silently blended together.
**Outcome/Lesson**: When a founder cites a real-world platform as a model to emulate, verify the mechanism directly before designing around it — the assumed behavior (point conversion) and the actual behavior (dual-crediting) implied materially different legal postures, and the actual one was both safer and simpler. Also: a metric framed as "engagement-based, therefore safe" can still be structurally wrong along a different axis (who can even reach it) — check eligibility/reach, not just the redemption-safety question, before finalizing a cross-side metric. Third pattern repeat: don't let a mechanism that's safe in one form (activity-based dual-credit) get cited as covering a related-but-different form (subscription-based) just because they look similar on the surface.
**Links**: BUSINESS.md §6a/§3/§7/§11, DESIGN.md §2c/§6/§7b/§7d, LEGAL_REVIEW.md Status/Q8/Part 4 (Q12-13)

---

## 2026-07-30 (staging E2E + auth gate + account deletion)

**Decision**: Built a self-contained staging E2E test pipeline decoupled from Docker Supabase. Tests create disposable users via the hosted Supabase admin API (`test-{runId}-{role}-{counter}@staging.local`), run against the deployed staging URL, and capture evidence for UAT scoring. No dependency on `pnpm db:reset` or local Docker.
**Context**: The existing Playwright suite (smoke/override/signup) is tightly coupled to local Docker Supabase — tests call `supabase.auth.signUp()`, sign in via password, and rely on `db:reset` for clean state. Running those tests against staging would require refactoring every helper (environment variables, auth flows, data cleanup) and losing the password-login path (staging has password login disabled by default for security). Building a new staging-native test suite was faster than adapting the existing one.
**Outcome/Lesson**: Test isolation via unique email prefix per run (`test-{runId}-*@staging.local`) is simple and effective with the hosted admin API. The `ensureStagingUser` retry-with-backoff pattern handles Supabase free-tier cold starts. The per-test AI call cap (max 3 calls, enforced by counter) protects against runaway Modal costs. The warm-up step before the suite mitigates scale-to-zero cold starts — but the warm-up is fire-and-forget, so if the first real test call arrives >120s after warm-up, the Modal GPU has already spun down. A keepalive poll loop could close this gap if it proves unreliable.
**Links**: e2e/staging-helpers.ts, e2e/staging-functional.spec.ts, .github/workflows/e2e-staging.yml, AGENTS.md

**Decision**: UAT scoring uses an OpenCode GitHub action with dual-agent consensus (two independent subagent calls, deltas > 1 on any dimension → human review). The scoring agent is defined at `.opencode/agent/uat-scorer.md` — committed to the repo so the CI agent discovers it automatically. Rejected single-agent scoring: without calibration ground truth, a single LLM's absolute scores drift across runs.
**Context**: The UAT tests capture screenshots + DOM state as evidence, stored in Supabase `staging-test-evidence` bucket. The scoring pipeline runs after the Playwright tests complete: the OpenCode GitHub action reads the evidence, spawns two subagents via the Task tool, compares scores, checks regressions against the previous baseline, and creates a GitHub issue if any score < 3 or a regression is detected.
**Outcome/Lesson**: The dual-agent consensus pattern adds ~2× the compute cost but the calibration/reliability benefit is worth it for a business-critical scoring function. Evidence retention (keep 3 runs) balances storage space against useful history. The shared scoring subagent prompt (`.opencode/agent/uat-scorer.md`) makes the scoring criteria auditable and versioned.
**Links**: .opencode/agent/uat-scorer.md, e2e/uat-rubric.json, e2e/staging-uat.spec.ts

**Decision**: Middleware auth gate uses **two parallel defense layers**: HTTP Basic Auth for human access and `x-staging-auth` shared-secret header for CI bypass. The gate only activates when `STAGING_BASIC_AUTH` or `STAGING_SHARED_SECRET` env vars are set — invisible in local dev. `/api/health` is always open for the keepalive cron.
**Context**: GitHub Actions runners have dynamic IPs, not static ranges — IP allowlisting isn't feasible. Basic auth alone requires storing credentials in Playwright's `httpCredentials`, which works but is fragile (the credential must match Vercel's env exactly). Adding a shared-secret header gives CI a second bypass path without relying on the browser's credential cache.
**Outcome/Lesson**: Defense-in-depth with env-var gating means the auth code lives in the same middleware file as session refresh (no separate config or infrastructure). The gate is invisible in local dev because those env vars are never set in `.env` files — only on Vercel. Health endpoint exemption ensures the keepalive cron works regardless of auth state. One trade-off: the `atob()` call in Edge Runtime is fast but only works for ASCII credentials — the generated password is URL-safe token_urlsafe(18), which avoids encoding issues.
**Links**: src/middleware.ts, AGENTS.md

**Decision**: Account deletion is a full feature with a dedicated `/account` page, confirmation modal ("Type DELETE to confirm"), and a server action that sanitizes points_ledger before cascade-deleting via `auth.users.ON DELETE CASCADE`. Resume files are deleted from Supabase Storage before the user is removed. Recruiter job postings are soft-closed (status → `closed`) rather than hard-deleted for 10-year financial audit retention. A confirmation email is sent via Supabase built-in sender.
**Context**: Privacy-first platform needs a demonstrated full data lifecycle. The append-only points_ledger has `ON DELETE CASCADE` from profiles, so rows must be sanitized before the profile is deleted — otherwise they vanish entirely. The cleanup script (weekly cron) reuses the same deletion server action, which also serves as a functional test of the feature.
**Outcome/Lesson**: The points_ledger sanitization order matters: UPDATE to detach + de-identify BEFORE deleting the user (the cascade would remove the rows before we could null them). The "unique email per run" test data strategy means cleanup is best-effort (delete users > 24h old) — never delete users from running tests. The cleanup script uses the same server action with service role auth, ensuring the deletion path is tested twice: once by the functional test, once by the cron.
**Links**: src/app/(app)/account/page.tsx, src/app/(app)/account/actions.ts, .github/workflows/cleanup-staging.yml

---

## 2026-08-03 (brand rename + Cyberport CCMF application)

**Decision**: Rebranded to **Binding** as the public brand; the prior working name was retired entirely. Domain strategy: `getbinding.com` for MVP (purchased). Full name purge executed the same day — all technical identifiers renamed to Binding (UI workspace package, Vercel project `binding-staging`, Modal app/secret names, docker stack name, Supabase project_id `"binding"`), so no residual reference to the old name remains in code, infra, or docs.
**Context**: Preparing the Cyberport Creative Micro Fund (CCMF) application (HK$100K, no matching requirement) surfaced a brand problem: the working name collided with an inactive `.com` holding and read as generic. The founder chose "Binding" (contract/bond metaphor matching the trust-minimizing broker positioning). Individual application (no HK opco yet; incorporation funded within the grant window). The CCMF application package lives in local-only `ccmf-app/` (gitignored — PII-bearing).
**Outcome/Lesson**: The CCMF application draft (`ccmf-app/CCMF-Application-Binding.md`) incorporates independent research subagents' findings — 3,799 licensed HK agencies, 28.6% gender pay gap, 13-30% placement fees, boutique legal costs HK$50-60K bundled, cloud stack ~HK$832/mo. Key strategic reframes from the reviewer pass: (1) emphasize the already-deployed working prototype over paper claims, (2) replace "$16-20B TAM" oversell with verifiable HK-specific numbers, (3) address the 20 hrs/week commitment transparently rather than hiding it, (4) frame social responsibility around measurable HK policy angles (gender pay gap, anti-discrimination, worker privacy). Founder covers budget overruns as capital injection — stated in the application as a positive signal.
**Links**: ccmf-app/CCMF-Application-Binding.md, BUSINESS.md §2.1, DESIGN.md §2.4, VISION.md §1.5, .opencode/skills/pdf-reader/, scripts/pdf2md.mjs
