# JumpOnBoard (J.O.B.)

Privacy-first, AI-driven hiring platform for APAC (Hong Kong & Singapore) — pseudonymized-by-default candidate matching, consent-first reveals, and a closed-loop points economy in place of ads/cold-outbound recruiting.

## Status

Walking-skeleton MVP: every layer wired, one thin vertical slice working
end-to-end (seeker publishes redacted profile → recruiter publishes job →
vector match with dealbreaker filter → candidate opt-in → paid reveal with
points ledger → in-app messaging). Covered by a Playwright e2e test.

## Setup

Prereqs: Node 22+, pnpm, Docker (for local Supabase).

```bash
pnpm install
pnpm db:start          # local Supabase (Postgres+pgvector, auth, storage)
pnpm db:reset          # apply migrations + demo seed
cp .env.example .env.local   # fill keys from `pnpm db:start` output
pnpm dev               # http://localhost:3000
```

Demo accounts (local seed): `seeker@demo.local` / `recruiter@demo.local`,
password `J0B!Demo#2026$secure` (password tab on the login page). Magic-link emails
land in Inbucket: http://127.0.0.1:54324

## Commands

| Command | What |
|---|---|
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm lint` / `pnpm typecheck` | ESLint / tsc |
| `pnpm test` | Vitest unit tests (stub AI, matching filter, privacy guardrail) |
| `pnpm e2e` | Playwright smoke: the full reveal slice (needs `pnpm db:reset` first) |
| `pnpm db:start` / `pnpm db:reset` | Local Supabase up / migrate+seed from zero |

## Stack (why: free-tier + solo-founder constraints — see DESIGN.md §12)

- **Next.js 16** (App Router, TS strict, Tailwind 4 + shadcn/ui), hosted on
  **Vercel** (Hobby tier) for staging frontend
- **Supabase** free tier: Postgres + pgvector (HNSW), Auth (magic link), Storage,
  RLS as the privacy enforcement layer. GitHub Actions cron pings `/api/health`
  every 3 days to dodge the 7-day free-tier pause
- **AI**: provider-agnostic adapter (`src/lib/ai/`) — deterministic **stub** for
  dev/CI (zero cost/network), **Qwen3 8B + Qwen3-Embedding-0.6B on Modal**
  ($30/mo Starter credit) for real inference; deploy per `modal_app/README.md`
- **Privacy rule** (enforced by types + tests): candidate-derived data only ever
  hits the self-hosted Modal path, never a frontier API

## Doc Map

| File | Purpose |
|---|---|
| [BUSINESS.md](./BUSINESS.md) | Strategy, market sizing, pricing, revenue model, risk management — the investor-facing pitch document |
| [DESIGN.md](./DESIGN.md) | Technical architecture — data model, matching pipeline, reveal mechanics, privacy architecture, AI-Credit Marketplace |
| [VISION.md](./VISION.md) | Mission, north star metric, phased OKRs, evaluation cadence, kill-criteria |
| [MEMORY.md](./MEMORY.md) | Append-only execution-lesson log — founding decisions, why they were made, and outcomes as they're learned |
| [LEGAL_REVIEW.md](./LEGAL_REVIEW.md) | Briefing memo for SG/HK counsel on the points-economy/AI-Credit Marketplace licensing exemption question — a hard blocker on that feature until reviewed |
| [CLAUDE.md](./CLAUDE.md) | Guidance for Claude Code instances working in this repo |

## Shipped beyond the skeleton

- **Override reveals** (DESIGN.md §4): 25 pts reveals a non-opted-in candidate
  immediately; messaging unlocks only if they accept; 15-pt premium refunds on
  decline or 7-day expiry; 5/day cap + 30-day re-override block.
- **Dual-role registration**: seeker and recruiter are independent opt-in
  roles with a header switcher; seeker onboarding is a guided consent-first
  wizard; recruiters register a company/agency name candidates always see.

## Deferred (tables exist, logic doesn't)

Point purchases ("top-ups coming soon"), verified-action earning,
interview-scheduling UI, enterprise tier, company verification, email
notifications, AI-Credit Marketplace (hard legal blocker — LEGAL_REVIEW.md).
Production email needs the Resend SMTP swap noted in `.env.example` before
real beta invites.
