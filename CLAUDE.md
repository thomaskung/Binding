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
- `pnpm db:reset` — reapply migrations + seed from zero (local Docker Supabase)
- `pnpm cf:build` — OpenNext Cloudflare Workers build (deploy target)

Demo logins (seeded): `seeker@demo.local` / `recruiter@demo.local`, password `J0B!Demo#2026$secure`.

## Architecture (see DESIGN.md for the full design; §12 for MVP substitutions)

- Single Next.js 16 app (App Router, TS strict, Tailwind 4 + shadcn/ui on Base UI — buttons-as-links use `render={<Link/>}`, NOT Radix `asChild`). Server actions in `src/app/*/actions.ts` carry most backend logic.
- `src/middleware.ts` (legacy convention on purpose — Next 16 `proxy.ts` is Node-only and @opennextjs/cloudflare requires edge) refreshes Supabase sessions + gates auth.
- Supabase: schema in `supabase/migrations/0001_schema.sql`, RLS + grants in `0002_rls.sql`. RLS is the privacy layer — raw resumes owner-only, matching goes through the `match_candidates` security-definer RPC (returns pseudonymized fields only). Cross-table policies use security-definer helper functions (`is_job_owner`, `seeker_has_match`) — inline subqueries recurse.
- AI adapter (`src/lib/ai/`): `AI_PROVIDER=stub` (deterministic, dev/CI default) or `modal` (Qwen3 8B + Qwen3-Embedding-0.6B, `modal_app/`, deploy per its README). Embeddings are 1024-dim (`vector(1024)` columns).
- **Privacy invariant** (DESIGN.md rule, enforced by the `JDTextOnly` branded type + `tests/frontier-guardrail.test.ts`): candidate-derived data only ever goes to the self-hosted Modal path — never a frontier API. Only recruiter-authored JD text may cross that line.
- Points: `src/lib/points.ts` — append-only ledger, placeholder economics constants. AI-Credit Marketplace redemption is a hard legal blocker (LEGAL_REVIEW.md).
- Reveal flow (`revealCandidate` / `overrideRevealCandidate` in `src/app/recruiter/actions.ts`): standard = opt-in-gated 10 pts; override = 25 pts pre-opt-in (name disclosed immediately, messaging gated on candidate accept, 15-pt premium refunds on decline/7-day expiry, 5/day cap, 30-day re-override block — guards in `src/lib/points.ts`). Per-role, admin client (service role bypasses RLS; actions enforce invariants).
- Dual-role accounts: `profiles.is_seeker`/`is_recruiter`, both opt-in via `/onboarding/{seeker,recruiter}` (consent capture required — `src/lib/consent.ts` CONSENT_VERSION). `requireRole` redirects to the missing role's opt-in. Role switcher sets `job_active_role` cookie; `/` honors it.

## Gotchas

- Migrations edited in place are fine pre-launch, but always verify with `pnpm db:reset` from zero.
- Seeded `auth.users` rows need empty-string token columns, not NULL (GoTrue 500s otherwise) — see `supabase/seed.sql`.
- New tables need explicit `grant` statements (end of `0002_rls.sql`) — RLS policies alone return 42501.
- TypeScript pinned to 5.x (typescript-eslint breaks on TS 7); ESLint pinned to 9 (eslint-config-next 16 incompatible with ESLint 10).
- Strategy docs (BUSINESS/DESIGN/VISION/MEMORY/LEGAL_REVIEW) are load-bearing context — decisions there were deliberately made; check MEMORY.md before re-litigating one.
