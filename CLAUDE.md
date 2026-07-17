# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — dev server (needs local Supabase: `pnpm db:start`, then `pnpm db:reset` for migrations+seed; keys go in `.env.local`, see `.env.example`)
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — ESLint, tsc, Vitest units
- `pnpm test -- tests/matching.test.ts` — single test file
- `pnpm e2e` — Playwright smoke (starts its own dev server; run `pnpm db:reset` first for clean seed)
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
- Reveal flow (`revealCandidate` in `src/app/recruiter/actions.ts`): opt-in-gated, per-role, debits recruiter/compensates candidate via admin client (service role bypasses RLS; the action enforces invariants itself).

## Gotchas

- Migrations edited in place are fine pre-launch, but always verify with `pnpm db:reset` from zero.
- Seeded `auth.users` rows need empty-string token columns, not NULL (GoTrue 500s otherwise) — see `supabase/seed.sql`.
- New tables need explicit `grant` statements (end of `0002_rls.sql`) — RLS policies alone return 42501.
- TypeScript pinned to 5.x (typescript-eslint breaks on TS 7); ESLint pinned to 9 (eslint-config-next 16 incompatible with ESLint 10).
- Strategy docs (BUSINESS/DESIGN/VISION/MEMORY/LEGAL_REVIEW) are load-bearing context — decisions there were deliberately made; check MEMORY.md before re-litigating one.
