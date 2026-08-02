# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conventions

- **Every feature ships with unit tests AND acceptance (Playwright e2e) tests** — standing instruction from the founder. Unit tests live in `tests/` (extract pure helpers to `src/lib/` to create a testable surface when pages are mostly RSC/redirect logic); e2e specs live in `e2e/`. Run the full e2e suite after UI-affecting changes and fine-tune until green.
- **Strategy docs are versioned**: BUSINESS/DESIGN/VISION/LEGAL_REVIEW carry a `**Version X.Y** · Last updated …` header and a Revision History table at the bottom. When materially editing one, bump the version, update the date, and add a history row. MEMORY.md is exempt (inherently chronological).

## Commands

- `pnpm dev` — dev server (needs local Supabase: `pnpm db:start`, then `pnpm db:reset` for migrations+seed; keys go in `.env.local`, see `.env.example`)
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — ESLint, tsc, Vitest units
- `pnpm test -- tests/matching.test.ts` — single test file (units: `matching`, `stub-provider`, `frontier-guardrail`, `signup-intent`)
- `pnpm e2e` — Playwright acceptance suite (`smoke`, `override`, `signup` specs; starts its own dev server; run `pnpm db:reset` first for clean seed; needs `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` in `.env.local` for the password tab the specs sign in with)
- Staging E2E: `npx playwright test e2e/staging-functional.spec.ts` against deployed staging (secrets from `.env.local`, see AGENTS.md)
- `pnpm db:reset` — reapply migrations + seed from zero (local Docker Supabase)
- `pnpm test-data:generate` — regenerate `test-data/smoke-seed.generated.sql` after editing the JSON files in `test-data/`

Demo logins (seeded): `seeker@demo.local` / `recruiter@demo.local`, password `J0B!Demo#2026$secure`.

`test-data/` is a dev-only smoke dataset (10 seekers, 11 jobs across 4 companies, real matches) auto-loaded on every `pnpm db:reset` via `supabase/config.toml` `[db.seed] sql_paths` — see `test-data/README.md`.

## Architecture (see DESIGN.md for the full design; §12 for MVP substitutions)

- Single Next.js 16 app (App Router, TS strict, Tailwind 4 + shadcn/ui on Base UI — buttons-as-links use `render={<Link/>}`, NOT Radix `asChild`). Server actions in `src/app/*/actions.ts` carry most backend logic.
- pnpm workspace: the 11 shadcn/ui components + `cn()` live in `packages/ui` (`@jumponboard/ui`), a real internal package the app consumes via `transpilePackages` (its `main`/`types` point at `src/index.ts` directly, never a bundled `dist/`, so `"use client"` directives on its components survive). Theme tokens live in `packages/ui/src/theme.css`; the app's `src/app/globals.css` is just `@import "@jumponboard/ui/theme.css";`. This is also what the `.design-sync/` Claude Design sync targets — see `.design-sync/NOTES.md`.
- **The Claude Design mockup is the authoritative UIUX** (founder directive, 2026-07-24): every screen follows its template in project `dc871eb6-…` (`templates/*/**.dc.html`), readable via the DesignSync tool (main thread only — not provisioned to subagents). Theme is monochrome (near-black primary, no serif heading font — the earlier purple/Newsreader brand was removed). Reconciliation rules: shell wins chrome, templates win content; legal/privacy controls are never dropped by a redesign; privacy/economics invariants cap literal adherence (e.g. seekers never see raw scores even where a template shows `92% match`). Deliberately-not-built template elements are documented in the screen components' doc comments (Team-members card, Sponsored ad slot, Equity dealbreaker, pre-reveal salary expectations).
- App shell (`src/components/app-shell.tsx`, per the NavShell template): 236px/64px rail (starts collapsed; `rail_open` cookie persists, <768px auto-collapses on mount), hamburger toggle, all-live nav items, inline SWITCH MODE panel (vertical Seeker/Recruiter/Enterprise-disabled tabs), header = alerts strip + sparkle AI-suggestion chip (`src/lib/nav-suggestion.ts`) + "{n} points" chip, back-to-top FAB. Role resolution + rail state read server-side in `(app)/layout.tsx` (cookies) — never `document.cookie`/localStorage in the client component (hydration).
- Routing is path-segment only, NO query params (founder rule): `/seeker/matches` (old `?view=matches` redirects), `/seeker/matches/[id]`, `/seeker/points`, `/seeker/profile` (structured fields) + `/seeker/profile/resume` (editor canvas), `/recruiter` (aggregate pipeline dashboard), `/recruiter/jobs` (postings list), `/recruiter/jobs/[id]` (+ `/matches`).
- `src/middleware.ts` (Edge Runtime, used for Supabase session refresh + auth gating on Vercel). Also includes a staging auth gate (basic auth + `x-staging-auth` shared secret, defense-in-depth, only activates when env vars are set — invisible in local dev). Health endpoint always open.
- Supabase: schema in `supabase/migrations/0001_schema.sql`, RLS + grants in `0002_rls.sql`. RLS is the privacy layer — raw resumes owner-only, matching goes through the `match_candidates` security-definer RPC (returns pseudonymized fields only). Cross-table policies use security-definer helper functions (`is_job_owner`, `seeker_has_match`) — inline subqueries recurse.
- AI adapter (`src/lib/ai/`): `AI_PROVIDER=stub` (deterministic, dev/CI default) or `modal` (Qwen3 8B + Qwen3-Embedding-0.6B, `modal_app/`, deploy per its README). Embeddings are 1024-dim (`vector(1024)` columns).
- **Privacy invariant** (DESIGN.md rule, enforced by the `JDTextOnly` branded type + `tests/frontier-guardrail.test.ts`): candidate-derived data only ever goes to the self-hosted Modal path — never a frontier API. Only recruiter-authored JD text may cross that line.
- Points: `src/lib/points.ts` — append-only ledger, placeholder economics constants. AI-Credit Marketplace (repositioned as a scoped AI career-assistant allowance, DESIGN.md §7) is confirmation-only pending counsel, not a hard blocker (LEGAL_REVIEW.md) — still not-yet-built pending post-MVP usage-cost data.
- Reveal flow (`revealCandidate` / `overrideRevealCandidate` in `src/app/recruiter/actions.ts`): standard = opt-in-gated 10 pts; override = 25 pts pre-opt-in (name disclosed immediately, messaging gated on candidate accept, 15-pt premium refunds on decline/7-day expiry, 5/day cap, 30-day re-override block — guards in `src/lib/points.ts`). Per-role, admin client (service role bypasses RLS; actions enforce invariants).
- Dual-role accounts: `profiles.is_seeker`/`is_recruiter`, both opt-in via `/onboarding/{seeker,recruiter}` (consent capture required — `src/lib/consent.ts` CONSENT_VERSION). `requireRole` redirects to the missing role's opt-in. Role switcher sets `job_active_role` cookie; `/` honors it.
- Consent is **granular** (migration 0016, DESIGN.md §2a): processing + automated-profiling consents are required at seeker onboarding; continuous-maintenance consent is optional/withdrawable (settings toggle + JIT prompt on `/seeker/nudge`) and gates `requestMaintenanceDraft`/`acceptMaintenanceUpdate`. E2e specs onboard via the shared `e2e/seeker-onboarding.ts` helper.
- Layered privacy (DESIGN.md §2f, "Privacy at the edge, Security at the core"): Layer-0 controls are live — `src/lib/pii-patterns.ts` (deterministic contact-identifier strip: client-side on the paste path, at-ingest on the PDF draft path; `resumes.raw_text` stays faithful/never stripped), `src/lib/pdf-metadata.ts` (Info+XMP strip before storage), `e2e/no-third-party.spec.ts`. Cross-party identity disclosures write to the append-only `pii_access_log` (0017, service-role-only) via `src/lib/pii-audit.ts`. Both reveal paths are daily-capped (`REVEAL_DAILY_CAP`/`OVERRIDE_DAILY_CAP`, cap checked before balance — `revealSpendGuard` in `src/lib/points.ts`, invariants in `tests/reveal-invariants.test.ts`). Edge/Core physical split is roadmap — never join raw-PII tables into core-side (matching/ledger) query paths.
- E2e port: `E2E_PORT=3100 pnpm e2e` when another local service holds 3000 (playwright.config.ts).
- Seeker match bands (`matchBand()` in `src/lib/matching.ts`): raw cosine score never reaches seeker-facing code (recruiter-only, migration 0001) — seekers only ever see the qualitative `high`/`normal`/`low` band, and `high` caps down to `normal` unless `profiles.seeker_tier = 'pro'` (DESIGN.md/BUSINESS.md "Pro seeker $9.99/mo", first schema-backed by migration 0006). No billing integration exists yet — `seeker_tier` is flipped via the dev-only toggle on `/seeker` (refuses outside `NODE_ENV !== "production"`).
- Structured work history (`seeker_experience` table, migration 0008) is owner-only (RLS, same posture as `resumes`/`skill_vectors`) — recruiters never see raw entries. `src/lib/experience.ts` derives aggregate signals (years of experience via interval-merge, tenure/stability, dominant industry) that `publishProfile()` appends to the redacted text before embedding — one cosine-similarity score, no separate scoring formula. Deliberately uses tenure/stability instead of an employer-reputation score (fairness: avoids proxying for company prestige).

## Gotchas

- Migrations edited in place are fine pre-launch, but always verify with `pnpm db:reset` from zero.
- Seeded `auth.users` rows need empty-string token columns, not NULL (GoTrue 500s otherwise) — see `supabase/seed.sql`.
- New tables need explicit `grant` statements (end of `0002_rls.sql`) — RLS policies alone return 42501.
- TypeScript pinned to 5.x (typescript-eslint breaks on TS 7); ESLint pinned to 9 (eslint-config-next 16 incompatible with ESLint 10).
- Strategy docs (BUSINESS/DESIGN/VISION/MEMORY/LEGAL_REVIEW) are load-bearing context — decisions there were deliberately made; check MEMORY.md before re-litigating one.
- Local Supabase (`pnpm db:start`) runs in Docker — don't leave it running once you're done testing/dev-serving. `npx supabase stop` after (data persists in the docker volume; `pnpm db:reset` reloads it next time). Other unrelated containers may be running on the same machine — only stop this project's `supabase_*_jumponboard` stack, not others.
- **Staging**: Vercel hosts the frontend (`main` branch = staging deploy), Supabase for backend, Modal for private AI inference. See `AGENTS.md` for setup/CLI details.
- Staging is gated by HTTP Basic Auth + `x-staging-auth` shared secret header (defense-in-depth).
  Set `STAGING_BASIC_AUTH` + `STAGING_SHARED_SECRET` env vars on Vercel to activate.
  No gate in local dev — middleware checks for these env vars before applying.
- Account deletion implemented at `/account` — cascading delete with points ledger sanitization
  (DESIGN.md §11). Tested nightly as functional test #15.
