> **Disposition note (2026-07-28)** — every problem below was verified against the actual codebase, strategy docs, and (for Problem 5) an adversarial deep-research pass before acting. Per-problem dispositions are annotated inline; fixes landed in DESIGN.md 2.0, BUSINESS.md 1.8, LEGAL_REVIEW.md 1.5 and the accompanying code changes (migrations 0016/0017, Layer-0 controls, reveal daily cap, Modal region pin). This document is kept as the research input that prompted the pass.

Based on an analysis of your system design and business plan, your core concept of a privacy-preserving talent marketplace is highly compelling. However, bridging your current technical architecture (Supabase, serverless LLMs, and centralized vector databases) with your strategic roadmap (securing non-dilutive Hong Kong government grants and expanding into Singapore's enterprise B2B market) reveals **five critical technical, legal, and operational vulnerabilities**.

Below is an analysis of these problems along with actionable, low-dilution engineering fixes.

---

### Problem 1: The Cryptographic Blindspot (Embedding Inversion Attacks)

> **Disposition: partially valid — threat real, premises stale.** Redaction-before-embedding was already enforced (`publishProfile` redacts, then embeds), `skill_vectors` SELECT is owner-only, and no endpoint ever returns raw embedding vectors — so inversion recovers already-redacted text, not raw PII. Real gap: the threat was undocumented and no perturbation hardening existed. Fixed: DESIGN.md §5 embedding-inversion threat model (redact-first named as a load-bearing invariant); DP-noise = deferred-with-trigger roadmap hardening, plus a new standard-reveal daily cap closing the "rate-limited reveals" overclaim.

* **The Vulnerability:** Your system relies on storing candidate resume embeddings in a centralized Supabase database using `pgvector` to run similarity match queries.


* **The Problem:** There is a common misconception that text embeddings are "one-way" and therefore privacy-safe. Recent security research proves that text sequences and highly sensitive personal identifiable information (PII) can be reconstructed directly from raw embeddings with up to $92\%$ accuracy using zero-shot inversion techniques such as `ZSInvert` and `vec2text`. If an attacker gains read access to your Supabase vector database or queries your vector similarity endpoints, they can reconstruct candidate resumes, completely bypassing your frontend redaction boundaries.
* **The Fix:**
1. **Syntactic Masking Prior to Embedding:** Never generate vector embeddings on raw, unredacted resumes. Ensure that the text sent to your embedding model is strictly anonymized first, satisfying $k$-anonymity and $t$-closeness standards (e.g., stripping names, companies, exact locations, and graduation years).
2. **Vector Perturbation (Differential Privacy):** Inject calibrated Gaussian noise directly into your computed embedding vectors prior to storing them in `pgvector`. This prevents reconstruction algorithms from working while maintaining sufficient cosine similarity for matching.



---

### Problem 2: Geographic R&D Violations under Hong Kong ESS Grant Rules

> **Disposition: false premise, true conclusion-adjacent.** No ESS capitalization plan existed in BUSINESS.md — but the founder confirmed (2026-07-28) grants ARE planned, so the geography rules matter. ESS is 1:1 matching (HK$10M grant needs HK$10M own capital), so the adopted plan is a ladder: Cyberport CCMF / HKSTP Ideation → incubation → ESS at Series-A (BUSINESS.md §9a); the HK edge layer (DESIGN.md §2f) is the grant-scoped R&D. Real adjacent gap found: Modal had NO region config (implicit US) — now pinned `region="ap"`. RTH and locality rules recorded as directional/unverified; grant consultant before applying.

* **The Vulnerability:** Your strategic capitalization plan relies on securing up to HK$10 million from Hong Kong's Enterprise Support Scheme (ESS) on a 1:1 matching basis. However, your system design specifies using US-hosted serverless GPU platforms (Modal, Baseten)  and potentially remote developers.


* **The Problem:** The Innovation and Technology Commission (ITC) strictly mandates that R&D work funded under the ESS must be conducted **primarily within the territory of Hong Kong**. While up to 50% of the total project budget can be spent outside Hong Kong, this requires prior approval from the Commissioner for Innovation and Technology (CIT) and must be formally structured as outsourced R&D procurement. If you pay foreign serverless providers or hire remote global developers without domestic HK payroll accounting, you will fail the ITC audit and risk losing your grant.
* **The Fix:**
1. **Repartition your R&D Payroll:** Hire local Hong Kong engineers to build the core matching engine, and fully subsidize their salaries using the ITF Research Talent Hub (RTH), which is an eligible ESS cost.
2. **Localize Cloud/AI Compute:** Transition your serverless LLM and embedding pipelines from US servers to Hong Kong-hosted local cloud regions (e.g., AWS ap-east-1) or local APAC GPU providers to ensure your computational R&D spend counts as domestic local expenses.



---

### Problem 3: Regulated Stored Value Facility (SVF) Compliance in Hong Kong

> **Disposition: mostly already addressed; one premise wrong.** Fix 1 (non-convertibility ToS guardrails) was already BUSINESS.md §3/§11 policy. Fix 2's premise is wrong: the free AI resume rewrite is already a free action, not a ledger redemption (`refineProfileText` performs no points debit). The real residual — planned fiat top-ups + cross-party compensation flow — was already flagged to counsel (LEGAL_REVIEW.md Q3/Q11); a cross-reference note was added, no mechanism change.

* **The Vulnerability:** Your system design outlines a "closed-loop, non-monetary points ledger" featuring shared balances, earning (for onboarding, trials, and freshness updates), and spending/refunds (the reveal economy).


* **The Problem:** In Hong Kong, the Payment Systems and Stored Value Facilities Ordinance (Cap. 562) heavily regulates stored value platforms. While purely non-monetary points, gamified loyalty programs, and closed-loop internal utilities are generally exempt, if your points can ever be bought with fiat, transferred between users, exchanged for third-party services, or cashed out, your platform risks crossing into a regulated SVF territory requiring an expensive license from the Hong Kong Monetary Authority (HKMA).
* **The Fix:**
1. **Strict Non-Convertibility Guardrails:** Ensure your legal Terms of Service and database rules state that points hold zero monetary value, are completely non-transferable, cannot be redeemed or refunded for real currency, and can only be used as a gamified interface utility.
2. **Isolate Free Trials from Ledger Balances:** Instead of treating free resume rewrites as ledger redemptions, isolate them in your database as simple boolean flags (e.g., `has_used_free_rewrite = true`) to prevent inflating points ledger transactions.



---

### Problem 4: Automated Profiling and Accuracy Violations under Singapore’s PDPA

> **Disposition: half built, half real gap — fixed.** Fix 2 (HITL) already existed in full: suggest-and-approve + AI-never-fabricates (DESIGN.md §2c). Fix 1 was a real gap: consent was two versioned grants, with no separate automated-profiling notice. Fixed (migration 0016): three-way split — processing + profiling required, continuous maintenance optional/withdrawable with a JIT prompt and settings toggle; PDPA Accuracy Obligation named in DESIGN.md §2c; counsel questions Q14/Q15.

* **The Vulnerability:** Your system features a "continuous resume maintenance agent" acting as a lifelong editor , and an automated "candidate-paste reverse-match" fit score.


* **The Problem:** Under Singapore’s Personal Data Protection Act (PDPA) (including the 2024 updates) and Hong Kong’s PCPD guidelines, automated profiling and decisions that significantly affect an individual's livelihood require highly specific, granular notification. A generic "consent-before-processing" checkbox is legally insufficient for automated recruitment profiling. Furthermore, if your continuous AI maintenance agent modifies a profile directly and hallucinates a skill or experience, you are in immediate breach of the PDPA’s **Accuracy Obligation**, which requires organisations to ensure personal data is accurate and complete when used to make consequential decisions.
* **The Fix:**
1. **Granular Consent Gates:** Redesign your onboarding to feature separate consent checkboxes: one for basic data processing, one specifically notifying users that AI profiling is used for automated matching, and one for continuous AI optimizations.
2. **Mandatory Human-in-the-Loop (HITL) Commit Phase:** Your AI continuous maintenance agent must never commit changes directly to the live, searchable profile database. Instead, any optimizations should be stored as "Pending Suggestions." The candidate must receive a notification and explicitly click "Approve" to commit the changes, transferring legal accuracy responsibility back to the user.



---

### Problem 5: Centralization Bottleneck vs. Zero-Trust Marketing

> **Disposition: concern valid, proposed fix rejected.** Adversarial deep-research (2026-07-28) refuted the ZK-FL specifics: the 99.97%/77%/"eliminates gradient leakage" numbers appear in no paper; no ZK-FL-vs-HE benchmark exists; implementations are experimental (~20× overhead, zero production deployments); AI Verify and Project Moonshot are LLM-governance/safety toolkits, not cryptographic certifications — ZK-FL would not help "pass" them; PDPA mandates comparable protection, not residency. Adopted instead: the Edge/Core layered architecture with a customer-VPC edge for enterprise B2B (DESIGN.md §2f) — raw data stays in the client environment, only pseudonymized vectors flow to the core under DPA. ZK-FL: far-future-watch.

* **The Vulnerability:** You are marketing your platform as a "privacy-first" dark pool, yet your technical architecture is highly centralized. Raw data is processed on centralized serverless instances, and vectors are stored in a centralized database.


* **The Problem:** During enterprise (B2B) procurement in Singapore, risk and compliance teams are highly hesitant to allow external platforms to pull sensitive employee data out of their secure environments. This centralization will create a massive sales bottleneck when you attempt to expand into B2B.
* **The Fix:**
1. **Adopt Zero-Knowledge Federated Learning (ZK-FL):** As you transition to B2B, modify your technical architecture so that enterprise clients keep their employee databases localized.
2. **Implement ZK-FL Gradients and Verification:** Have clients process matching algorithms locally on their own firewalled servers, and transmit only a tiny, cryptographically verified Zero-Knowledge Proof (ZKP) to your central server to update the global matching model:

$$\text{Proof}_i = \text{ZK}(\text{Gradient}_i, \text{Hash}_i)$$


3. This completely eliminates the threat of gradient leakage, reduces payload transfer sizes by $99.97\%$, and cuts verification latency by $77\%$ compared to old homomorphic encryption methods. This mathematical guarantee will allow you to pass Singapore's **AI Verify** and **Project Moonshot** benchmarks, creating a major sales moat during enterprise B2B procurement.