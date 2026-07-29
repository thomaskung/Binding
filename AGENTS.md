# AGENTS.md

## Dev Setup

- `pnpm install` (pnpm 11.5.2 — `corepack enable` first if missing)
- Local Supabase required for dev: `pnpm db:start` → `pnpm db:reset` (Docker needed)
- Keys go in `.env.local` from `pnpm db:start` output or `.env.example`
- Demo logins: `seeker@demo.local` / `recruiter@demo.local`, password `J0B!Demo#2026$secure`
- Codespace at `.devcontainer/` pre-installs pnpm, Supabase CLI, Modal CLI, Vercel CLI

## Testing

- Unit tests: `pnpm test` (vitest, `tests/*.test.ts`, Node env)
- Single file: `pnpm test -- tests/matching.test.ts`
- E2E: `pnpm e2e` — must `pnpm db:reset` first, needs `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` in `.env.local`, runs serially (1 worker)
- Full verify: `pnpm lint && pnpm typecheck && pnpm test`

## Infrastructure CLI

**GitHub (`gh`)**
- Repo: `thomaskung/JumpOnBoard`
- Create PR from current branch: `gh pr create --fill`
- Merge PR: `gh pr merge <N> --merge` (add `--admin` if branch protection requires review)

**Vercel**
- Auth: token in `.env.local` (`VERCEL_API_TOKEN`)
- Link: `vercel link --project jumponboard-staging`
- Deploy: `vercel --prod --yes`
- Project ID: `prj_Ss1Qm2DUjBCVnAT4B4wCWa61T3js`, Org: `team_CdIwdiwt4WNwzkO5q43UP29H`
- Staging URL: `https://jumponboard-staging.vercel.app`

**Modal**
- Auth: `modal token set --token-id <ID> --token-secret <SECRET>` (values from `.env.local` comment; profile `thomaskung`)
- API secret: `modal secret create jumponboard-api-token MODAL_API_TOKEN=<value>`
- Deploy: `modal deploy modal_app/embeddings.py` + `modal deploy modal_app/llm.py`
- Endpoint URLs printed on deploy; set as Vercel env vars for `AI_PROVIDER=modal`

**Supabase**
- Local: `supabase start` / `supabase stop` / `supabase db reset`
- Hosted project ref: `qjqaeuzpsefawqwlfwlf` (region `ap-southeast-1`)
- Link remote: `supabase login` or `SUPABASE_ACCESS_TOKEN` → `supabase link --project-ref qjqaeuzpsefawqwlfwlf`
- Without link, push via pooler:
  `supabase db push --db-url "postgresql://postgres.<ref>:<DB_PW>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"`
  DB_PW in `.env.local`; URL-encode `%` as `%25` if present in password

## Gotchas & Conventions

- `@jumponboard/ui` is a pnpm workspace package shipped as raw TS source — needs `transpilePackages` in next.config
- New DB tables: add `GRANT` statements to `0002_rls.sql` or Supabase returns 42501
- Seeded `auth.users` rows: token columns must be `''` not `NULL` (GoTrue 500s)
- Routing is path-segment only — NO query params (founder rule)
- `127.0.0.1` and `localhost` are different origins to browsers; `allowedDevOrigins` set in next.config
- Privacy invariant: candidate-derived data never reaches frontier APIs — enforced by `JDTextOnly` branded type + `tests/frontier-guardrail.test.ts`
- AI defaults to `stub` (deterministic, zero cost, no network). Switch to `modal` only after Modal endpoints are deployed
- Migrations edited in place must be verified: `pnpm db:reset` from zero
- TS pinned to 5.x, ESLint pinned to 9 — upgrading breaks eslint-config-next
- Strategy docs (BUSINESS/DESIGN/VISION/LEGAL_REVIEW) are versioned — bump version, update date, add history row on material edits
- Staging: `main` branch = Vercel deploy, Supabase hosted, Modal AI. Codespace for dev.
