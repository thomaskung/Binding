# Claude Design prompts — resume-first pivot surfaces

Prompts for the **JumpOnBoard UI** design project (`dc871eb6-6c3c-48a1-bcff-c841313b456e`).
Paste **① Setup** first to establish shared rules, then one surface block per screen.
Backed by DESIGN.md §2c/§2d/§2e/§7a/§7c (roadmap, not yet built). When a design is
approved, hand-translate the `.dc.html` back to React/JSX (same as prior template pulls).

---

## ① Setup — paste first

```
You are designing screens for JumpOnBoard, a privacy-first APAC (HK/SG) hiring
platform. Build ONLY with the JumpOnBoard UI components (Button, Card + parts,
Tabs, Input, Label, Select, Textarea, Badge, Dialog, Separator, Toaster). Do
not invent components or pull generic ones.

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
