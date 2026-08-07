# Binding

Privacy-first, AI-driven hiring platform for APAC (Hong Kong & Singapore) — pseudonymized-by-default candidate matching, consent-first reveals, and a closed-loop points economy in place of ads/cold-outbound recruiting.

## Status

Walking-skeleton MVP: every layer wired, one thin vertical slice working
end-to-end (seeker publishes redacted profile → recruiter publishes job →
vector match with dealbreaker filter → candidate opt-in → paid reveal with
points ledger → in-app messaging). Covered by a Playwright e2e test.

## Setup

Prereqs: Node 22+, pnpm. **No Docker** — local Supabase was retired 2026-08-06; the
backend is hosted Supabase and staging is Vercel.

```bash
pnpm install
cp .env.example .env.local   # fill in the hosted Supabase keys (dashboard → Settings → API)
pnpm dev                     # http://localhost:3000, against hosted Supabase
```

Because `pnpm dev` talks to the **shared hosted** project, treat its data as real —
destructive experiments hit staging, not a throwaway local volume. `pnpm seed:staging`
restores the dataset.

Sign in with a magic link (delivered by the hosted project's mailer), or enable the
password tab locally with `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` in `.env.local`.

## Commands

| Command | What |
|---|---|
| `pnpm dev` / `pnpm build` | Next.js dev server / production build |
| `pnpm lint` / `pnpm typecheck` | ESLint / tsc |
| `pnpm test` | Vitest unit tests (stub AI, matching filter, privacy guardrail) |
| `pnpm e2e` | Playwright acceptance suite **against deployed staging** — needs the `E2E_*` secrets in `.env.local` (see `.env.example`); also runs in CI on every PR |
| `pnpm db:push` | Apply pending migrations to hosted Supabase (needs `SUPABASE_DB_URL`; CI does this on merge) |
| `pnpm seed:staging` | (Re)seed the hosted staging dataset (real Modal embeddings) |
| `node scripts/pdf2md.mjs "<file.pdf>" /tmp/out.md` | Convert a PDF to markdown (see the `pdf-reader` skill) |

## Stack (why: free-tier + solo-founder constraints — see DESIGN.md §12)

- **Next.js 16** (App Router, TS strict, Tailwind 4 + shadcn/ui), hosted on
  **Vercel** (Hobby tier) for staging frontend. The public landing page (at `/`)
  is open; login/signup/app routes are gated by HTTP Basic Auth +
  `x-staging-auth` shared secret header — contact maintainer for access.
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
| [AGENTS.md](./AGENTS.md) | Guidance for OpenCode agents — secrets policy, commands, infra CLI, gotchas |

## Shipped beyond the skeleton

- **Override reveals** (DESIGN.md §4): 25 pts reveals a non-opted-in candidate
  immediately; messaging unlocks only if they accept; 15-pt premium refunds on
  decline or 7-day expiry; 5/day cap + 30-day re-override block.
- **Dual-role registration**: seeker and recruiter are independent opt-in
  roles with a header switcher; seeker onboarding is a guided consent-first
  wizard; recruiters register a company/agency name candidates always see.
- **Account deletion**: full lifecycle at `/account` — cascade delete with
  points ledger sanitization, Supabase Storage cleanup, recruiter job soft-close.
- **Granular consent** (DESIGN.md §2a): processing + automated-profiling consent
  required at onboarding; continuous-AI-maintenance consent optional/withdrawable.
- **Privacy Layer-0 controls** (DESIGN.md §2f): client-side PII-pattern stripping,
  PDF metadata strip, zero-third-party-resource assertions on resume pages.
- **Staging pipeline**: auth-gated deployed environment + nightly functional/UAT
  E2E suite with OpenCode dual-agent rubric scoring (see `.github/workflows/`).

## Deferred (tables exist, logic doesn't)

Point purchases ("top-ups coming soon"), verified-action earning,
interview-scheduling UI, enterprise tier, company verification, email
notifications, AI-Credit Marketplace (confirmation-only for counsel — not a hard
blocker since 2026-07-21, see LEGAL_REVIEW.md).
Production email needs the Resend SMTP swap noted in `.env.example` before
real beta invites.
