# Claude Design prompts — resume-first pivot + recruiter-monetization surfaces

Prompts for the **JumpOnBoard UI** design project (`dc871eb6-6c3c-48a1-bcff-c841313b456e`).
Paste **① Setup** first to establish shared rules, then one surface block per screen.
Surfaces ②–⑧ are backed by DESIGN.md §2c/§2d/§2e/§7a/§7c (roadmap, not yet built).
Surfaces ⑨–⑯ (added 2026-07-22) are backed by DESIGN.md §4a / BUSINESS.md §7
(recruiter-side monetization, also roadmap — not yet built; source-code wiring is a
separate, later ask gated on these mockups being reviewed). When a design is
approved, hand-translate the `.dc.html` back to React/JSX (same as prior template pulls).

**Setup was updated 2026-07-22** — re-paste it in full (not just the new surface blocks)
before starting ⑨–⑯; the allowlist and shared facts both changed.

---

## ① Setup — paste first (updated 2026-07-22 — re-paste even if you pasted the old version earlier)

```
You are designing screens for JumpOnBoard, a privacy-first APAC (HK/SG) hiring
platform. Build ONLY with the JumpOnBoard UI components (Button, Card + parts,
Tabs, Input, Label, Select, Textarea, Badge, Dialog, Separator, Toaster, Slider,
Progress). Do not invent components or pull generic ones.

Hard rules for every screen:
- Use real APAC tech/finance content, never lorem (e.g. "Backend Engineer,
  Payments", "Rust · Go · PostgreSQL", "Singapore", "HK$45k–60k/mo").
- Privacy-first: recruiters NEVER see a candidate's raw resume, real-time
  location, or current salary. Seeker external/public view shows region only
  (e.g. "Singapore", not a street address) and salary only if the seeker opted
  to share.
- UI is ADAPTIVE, not generative: same components, different modules surface
  based on state. Design the distinct states explicitly as separate frames.
- Any AI-written content is SUGGEST-AND-APPROVE: shown as a draft the user
  accepts / edits / rejects. Never auto-applied, never presented as final.
- Job postings require a salary range at posting time — only the exact
  figure's visibility to candidates is optional (a recruiter can hide the
  number from candidates, but can't post with no range at all).
- Privacy controls (market-signal opt-ins, reveal-override toggle) live on
  their own Privacy Settings page under Profile, separate from
  profile-visibility settings — don't fold them into a visibility/appearance
  screen.
Acknowledge and wait for the first surface.
```

---

## ② Resume-first seeker onboarding (DESIGN §2c)

```
Surface: Seeker onboarding, resume-first. A single wizard, 3 steps shown as a
stepper.

Step 1 — Consent gate (MUST come before any upload): name field + two consent
checkboxes ("I agree to the Terms", "I consent to AI processing/redaction of my
resume"). Continue button disabled until both checked. Short reassurance line:
"Your raw resume stays private to you — recruiters only ever see a redacted,
skills-based profile."

Step 2 — Resume upload as the PRIMARY action: a large drop zone (PDF or paste
text). After upload, show an "AI extracted the following — review before saving"
panel: a list of suggest-and-approve cards for Skills, Roles, Industries, and
Work Experience entries, each with Approve / Edit / Remove controls and an
"Add manually" fallback. A visible note: "We only file what your resume says —
we never invent experience."

Step 3 — Dealbreakers: min base salary, equity, work setup (remote/hybrid/
onsite) as inputs/selects. Finish button publishes the profile.

Include a persistent "You can skip and finish later" affordance. Use the
stepper + Card + Input + Label + Select + Button + Badge (for extracted skills).
```

---

## ③ Adaptive seeker dashboard (DESIGN §2d)

```
Surface: Seeker dashboard, adaptive by profile state. Design FOUR distinct
frames of the same layout, differing only in which module leads:

A. Incomplete profile → a "Finish your profile" card leads (progress bar,
   resume-first CTA).
B. Published + active looker → the Matches list leads (pseudonymized match
   cards: role, company, match band as a Badge — High/Normal/Low, salary range,
   "Express interest" button). No raw scores shown.
C. Published + passive + stale (no update in months) → a Maintenance-nudge card
   leads (see surface ④), matches secondary.
D. Dual-role (seeker + recruiter) → same as B but with a role switcher in the
   header.

Shared header: points balance Badge, role switcher, sign out. Show the match
band as a qualitative Badge only — never a numeric score. Use Card, Badge,
Button, Tabs (if you separate Matches / Profile / Points).
```

---

## ④ Continuous-maintenance nudge (DESIGN §2c loop)

```
Surface: Maintenance nudge, shown when a profile is stale or a tenure milestone
passed. A Card: heading "Keep your profile fresh", body "Still at Acme Pay as a
Senior Backend Engineer? Anything new since Apr 2025 — a promotion, new project,
or skill?" A short free-text Textarea for the user's answer + a "Draft update"
button.

Second state (after the user answers): an AI-drafted suggest-and-approve diff —
show the proposed change to the profile (e.g. new bullet "Led migration to
event-driven payments, 2025") with Approve / Edit / Discard. Caption: "Draft
from what you told us — nothing changes until you approve." Use Card, Textarea,
Button, Badge, Separator. Also design the dismissed/empty state ("You're up to
date — last reviewed today").
```

---

## ⑤ Aggregate-signal opt-in consent (DESIGN §2e)

```
Surface: A settings card + a modal for opting into the anonymized market-signals
program. This is a SEPARATE consent, distinct from the AI-processing consent.

Settings card: toggle "Contribute to anonymized market insights" (default OFF),
with plain-language explainer: "We use only aggregated, non-identifiable data
(never your name, resume, or individual profile), and only when at least 20
similar people are in the group — otherwise the signal is suppressed. You can
opt out anytime." A "Learn what's shared / not shared" link opens a Dialog with
two columns: Shared (aggregate skill demand, salary-range trends) vs Never
shared (name, resume, employer, contact, individual profile). Use Card, a
switch/checkbox, Button, Dialog, Separator, Badge.
```

---

## ⑥ B2B market-intelligence product (DESIGN §2e / BUSINESS §7 — monetization surface)

```
Surface: Recruiter/enterprise market-intelligence dashboard, "free teaser +
paid depth". Design TWO frames:

A. Free teaser: a few aggregate signal cards (e.g. "In-demand skills — HK
   fintech: Rust ▲, Go ▲, Solidity ▲", "Expected salary raise, SG backend:
   +8% YoY"), each aggregate-only. Some cards blurred/locked behind an
   "Upgrade for full depth" CTA.
B. Paid depth: the locked cards unlocked — trend charts, breakdowns by
   seniority/location. EVERY figure is aggregate; add a persistent footnote:
   "Aggregated from opted-in profiles, minimum cohort of 20 — no individual
   data." Suppressed/low-cohort cells shown explicitly as "Not enough data"
   rather than hidden. Use Card, Badge, Tabs, Button, Separator.
```

---

## ⑦ Training home (DESIGN §7a — roadmap adjacency)

```
Surface: Training / reskilling home. Two tracks side by side as Card columns:

A. Individual career-path track: AI-driven quiz + guided-learning program cards
   toward a target role (e.g. "Path to Staff Backend Engineer" — modules,
   progress, credit cost per program). Tie completion to point-earning ("Earn
   points on completion").
B. Corporate compliance track: assigned programs (AML, Security Awareness) with
   due dates and completion Badges. Note that an employee can hold individual +
   corporate programs at once.

Use Card, Badge, Button, Separator, Tabs (Individual / Corporate). Show credit
cost, not cash price.
```

---

## ⑧ Contextual ad slot (DESIGN §7c — later-stage)

```
Surface: An inline contextual ad card, placed within a list (e.g. between match
cards). Targeted by page context only (role/skill), never by tracking. Label it
clearly "Sponsored" with a small note "Contextual only — no tracking." Keep it
visually distinct but unobtrusive. Use Card + Badge + Button.
```

---

# Fixes — round 1 (2026-07-21)

Corrections to templates already generated from prompts ②–⑦ above, found by reviewing
those mockups against DESIGN.md/BUSINESS.md. Paste each into the existing template's
chat thread in Claude Design (not a fresh ① setup) so it edits in place.

## Fix: Training Home — remove unverified regulatory claim, clarify credit funding

```
Fix the "AML Fundamentals" card: remove "(MAS-aligned)" from the title — that's an
unverified regulatory claim, not something we've actually had reviewed/certified.
Just "AML Fundamentals".

Also, the credits balance shown in the header ("120 credits") is a real, separate
instrument, not fake demo data — keep it, but it has three legitimate funding paths
worth knowing for any future edits: (1) users convert existing points into training
credits (one-way only — never back), (2) users earn credits directly by completing
quizzes/courses, (3) enterprises purchase credit bundles for staff seats (e.g. the
mandatory compliance-track programs) — those enterprise-assigned credits are a
SEPARATE balance from personal credits, never shown mixed into the same number if
you ever split the header into "personal" vs "assigned" credits.
```

## Fix: Seeker Dashboard — match-band cap must be invisible in every frame

```
Fix frames B (published/active looker) and D (dual-role) — BOTH currently show an
uncapped "High match" badge on the first match card. This contradicts a real, already-
shipped privacy rule: a free-tier seeker's true "High match" is capped down to display
as "Normal match" — and it must be visually and structurally IDENTICAL to a genuine
Normal match, no different styling, no upsell hint, nothing that lets you infer a
cap happened. Change both frames' first match card band to "Normal match" with the
same secondary Badge variant already used for real Normal matches elsewhere.

If you want to also show what a Pro seeker (uncapped) sees, that must be a distinct,
clearly labeled frame — e.g. "B2 · Pro seeker, uncapped" — never inferable from
frames B or D themselves.
```

## Fix: Market Intelligence — don't imply a priced tier that doesn't exist yet

```
Fix the locked-card overlays and the "Pro" header badge in the paid-depth frame:
change "Upgrade for full depth" to "Get full access" and change the "Pro" badge to
"Contact us" (outline variant). We haven't priced this product yet — it's a new,
standalone line item, not part of the existing Pro Headhunter/Pro SaaS subscriptions
— so the copy shouldn't imply an existing purchasable tier.
```

## Fix: connective UX — settings link + maintenance-nudge handoff

```
Two small additions to the Seeker Dashboard frames:
1. Add a "Settings" tab or link (in the Tabs row alongside Matches/Profile/Points)
   that would lead to the Market Insights Consent screen — just the affordance/tab,
   doesn't need to render that screen's content here.
2. In frame C (published, passive & stale), the "Refresh profile" button should
   visually read as leading into the Maintenance Nudge card flow (same product
   moment) rather than an unspecified generic action — e.g. same button label
   language as the Maintenance Nudge template's entry point.
```

## New: Benefits Discount Catalog (DESIGN §7b — reframed, now unblocked for design)

```
Surface: Benefits/Loyalty discount catalog. This is NOT a credit-spend screen — there
is no benefit-specific currency. Structure:

Header: user's current tier (e.g. "Tier 2" — generic/unnamed, tenure/activity-based,
NOT purchased — a short line like "Reached via 8 months of active engagement").

Below: a catalog grid of partner discount cards across categories — flights,
accommodation, wellness, IT equipment, healthcare, career advisory. Each card: partner
name, discount description (e.g. "15% off with partner code"), a "Get code" button.
Clicking reveals a generic code (same code for every user at that tier — never
personalized/tracked) and a clear line: "You'll pay [Partner] directly on their site —
JumpOnBoard never processes this payment." No checkout, no cart, no payment form
anywhere in this surface — every card ends at a redirect-out affordance, not a
transaction. Use Card, Badge (for tier + category), Button, Separator.
```

---

# Recruiter-monetization surfaces (added 2026-07-22, DESIGN §4a / BUSINESS §7)

Re-paste the updated ① Setup above before starting these — the component allowlist
(Slider, Progress) and two shared facts (mandatory salary range, separate Privacy
Settings page) are new and every block below depends on at least one of them.

## ⑨ Recruiter pricing/tier page (BUSINESS §7 — Free / Solo / Advanced)

```
Surface: Recruiter pricing/plans page, three tiers side by side as Card columns:
Free, Solo, Advanced.

Free: "1-2 reveals/month to try AI matching" — a taste, not a working plan.
Solo: monthly reveal-credit bundle, per-role spend budgeting, advanced Dark Pool
search, AI-optimized outbound messaging. Mark as "Most popular" — this is the
core paid tier for an independent recruiter/headhunter.
Advanced: everything in Solo, plus Market Intelligence (comp/bonus/commission/
equity trend data) and job-post ranking boost. Frame Market Intelligence
carefully: "Get full access" rather than "Upgrade" — this product isn't fully
priced/self-serve yet, so don't imply an existing purchasable sub-tier inside
Advanced.

Each column: a short feature checklist (Badge or plain list), a CTA button
("Current plan" disabled state on Free, "Upgrade" on Solo/Advanced). No dollar
figures on Solo/Advanced yet — show "Contact us" or leave price as a Badge
placeholder rather than a specific number. Use Card, Badge, Button, Separator.
```

## ⑩ Per-role budget & spend visualization (DESIGN §4a — job posting edit page)

```
Surface: Job posting edit page, "Budget" section (alongside the existing salary/
skills/description fields). Two states:

A. Setting a budget: a Slider for the posting's spend cap, labeled "Per-role
   budget cap." Show an abstract suggested-default marker on the slider track
   (a small tick/label reading "Suggested" — NO concrete point or dollar number
   next to it, pricing isn't final). Directly below the slider, a line showing
   the recruiter's actual constraint: "You have 340 pts unallocated across 2
   other active postings" — the slider's max is limited by this number, not an
   arbitrary ceiling. If the recruiter tries to drag past it, the slider simply
   stops there with a caption: "Limited by your available balance."
B. Spend-used view (once the posting has some reveal activity): a Progress bar
   labeled "Spend used this posting" showing e.g. 62 of a 150-pt cap, with the
   numbers as a caption above the bar.

State inline: this budget is a spend ceiling on the recruiter's single shared
points balance — not a separate wallet or currency. Use Card, Label, Slider,
Progress, Badge (for the unallocated-balance figure).
```

## ⑪ Match-list & reveal economics (DESIGN §4a — recruiter match list, multiple frames)

```
Surface: Recruiter's candidate match list for a job posting (same screen as the
existing match cards with the "% match" badge). Design FOUR frames:

A. Standard reveal pricing: each match card's reveal button shows a cost that
   scales with the match badge already shown (e.g. a 91% match costs more to
   reveal than a 68% match) — a small caption/tooltip on the price: "Stronger
   matches cost more — you're bidding for the best fit." Name this plainly, do
   not hide it in fine print.
B. Same-role volume discount: a second/third reveal against this SAME posting
   shows a visibly discounted price on the reveal button (e.g. a small strike-
   through or "2nd reveal discount" Badge next to the price).
C. Pending override, recruiter view: a pending-override card with a "Withdraw
   request" button. Clicking opens a confirm Dialog whose copy states a
   TRANSFER, not a refund-to-nobody: "Your points for this reveal aren't
   refunded to you — they go to the candidate as compensation for the
   interruption." Never phrase this as the points simply disappearing.
D. Seeker-facing counterpart (design as a second screen — candidate's pending-
   override card): after the recruiter withdraws, the card reads "Recruiter
   withdrew their request — you've been compensated 15 pts," visually distinct
   from the existing "you declined" state, and clearly showing the candidate
   gained value, not just that the request went away.

Use Card, Badge, Button, Dialog, Separator.
```

## ⑫ Paid AI JD-assist (DESIGN §4a — job posting edit page)

```
Surface: Job posting edit page, the existing "Refine with AI" button. Add a
visible cost caption/badge next to it: "Refine with AI · 5 pts". Design both
the enabled state and a disabled state for insufficient balance ("Refine with
AI · 5 pts — add points to use"). Use Button, Badge.
```

## ⑬ Market Intelligence dashboard extension (DESIGN §2e/§4a — new comp dimensions)

```
Surface: Recruiter/enterprise market-intelligence dashboard (extends the
existing free-teaser + paid-depth screen). Add THREE new aggregate signal
cards alongside the existing skill-demand and salary-trend cards: "Expected
cash bonus — SG backend engineers," "Expected sales commission — HK client-
facing sales roles," "Equity expectations — SG fintech." Same free-teaser
(blurred/locked) vs. paid-depth (unlocked, trend detail) pattern as the
existing cards.

State inline on every card, new and existing: every figure is aggregate-only,
with a persistent footnote "Aggregated from opted-in profiles, minimum cohort
of 20 — no individual data." A cohort below that threshold shows the card as
"Not enough data yet" rather than hiding it or showing a number. Don't imply
an existing priced/self-serve tier where none exists yet — same "Get full
access," not "Upgrade," language as the existing paid-depth frame. Use Card,
Badge, Tabs, Button, Separator.
```

## ⑭ Ranking-boost purchase + seeker-facing disclosure (DESIGN §4a — two frames)

```
Surface, frame A (recruiter side): a job posting's management page gains a
"Boost this posting" section, gated behind an "Advanced plan" Badge/lock if
the recruiter isn't on that tier. When available: a simple purchase flow —
pick a duration (7 / 14 / 30 days), see a points cost, confirm via Dialog. No
dollar prices — points only.

Surface, frame B (seeker side): the seeker's job/match list, where one boosted
posting's card carries a small, clearly visible "Promoted" Badge in a corner
or header of the card. State inline, explicitly: this label sits ALONGSIDE,
never replaces, the existing qualitative match-band Badge (High/Normal/Low) —
a boosted post's match band still follows the existing free-tier cap (a capped
"Normal" match must look visually identical to a genuine Normal match, whether
or not it's also Promoted). Use Card, Badge, Button, Dialog, Separator.
```

## ⑮ Privacy Settings page (new — under Profile, separate from visibility settings)

```
Surface: A new "Privacy" page/tab under Profile, distinct from the existing
profile-visibility settings screen. Contains THREE toggles, each with its own
plain-language explainer, stacked as separate Card sections:

1. Market signals (existing, moved here): "Contribute to anonymized market
   insights" — off by default. Explainer: aggregate-only, minimum cohort of
   20, opt out anytime.
2. Reveal override (existing, moved here): "Allow recruiters to reveal my
   profile before I express interest" — off by default, with the existing
   compensation-on-decline explainer.
3. Comp/bonus/equity signals (NEW, visually distinct from #1 — its own Card,
   not a sub-toggle): "Share comp expectations for market insights" — off by
   default. Explainer: "This is separate from general market signals above —
   it covers more sensitive data (bonus, commission, equity expectations), so
   it needs its own opt-in." Enabling this reveals a "Set your expectations"
   button leading to surface ⑯.

Use Card, Label, a toggle affordance (Switch if available, else a checkbox
pattern already used elsewhere in the product), Separator, Button.
```

## ⑯ Comp/bonus/equity expectations — capture form (new, standalone — DESIGN §4a)

```
Surface: A standalone page reached from the Privacy Settings toggle (⑮) — NOT
part of onboarding. Two frames:

A. Capture form: extends the existing dealbreaker-matrix-style inputs with
   three new optional fields — "Expected cash bonus," "Expected sales
   commission" (shown only if the seeker's profile indicates a client-facing/
   sales role), "Expected equity." Above the form, a banner card stating the
   incentive plainly: "Share your comp expectations, earn 5 pts, and unlock a
   personalized benchmark — see how your expectations compare to the market
   (once enough people share)." Below the form, a small line: "Shared, not
   verified" — distinguishing this from the AI-verified actions that earn
   points elsewhere in the product.
B. Personalized benchmark view (shown after at least one field is filled): a
   small aggregate comparison card, e.g. "Your expected bonus vs. SG backend-
   engineer median: —" with a "Not enough data yet" fallback state, same
   suppression language as ⑬.

Use Card, Label, Input, Select, Button, Badge.
```
