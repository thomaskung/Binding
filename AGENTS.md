# AGENTS.md

## Secrets Policy

- **All secrets live in `.env.local` only** — never in code, config files, documentation, or commit history.
- `.env.local` is gitignored and must never be staged. If a secret is detected in a tracked file, rotate it immediately.
- Repo-wide secrets are stored as GitHub Actions encrypted secrets (`gh secret set`), referenced via `${{ secrets.SECRET_NAME }}`.
- When documenting commands that require secrets, use placeholder names like `<supabase-role-key>`, never paste real values.
- The staging E2E command below is an example; real secrets come from `.env.local` or GH Actions secrets.

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
- Staging E2E (password login + basic auth required, secrets from `.env.local`):
  ```
  E2E_BASE_URL=https://jumponboard-staging.vercel.app \
  E2E_SUPABASE_URL=https://qjqaeuzpsefawqwlfwlf.supabase.co \
  E2E_SERVICE_ROLE_KEY="<supabase-role-key>" \
  E2E_STAGING_SECRET="<shared-secret>" \
  E2E_STAGING_BASIC_USER=staging \
  E2E_STAGING_BASIC_PW="<basic-auth-pw>" \
  npx playwright test e2e/staging-functional.spec.ts
  ```
- Nightly cron at 3am UTC runs full staging suite + UAT scoring via OpenCode GitHub action
- Full verify: `pnpm lint && pnpm typecheck && pnpm test`

## PDF Reading

- Public brand is **Binding**; "JumpOnBoard" was the internal code name (retired for branding).
- To read a PDF: `node scripts/pdf2md.mjs "<file.pdf>" /tmp/out.md` (uses `@firecrawl/pdf-inspector`), then Read the markdown. See the `pdf-reader` skill.
- Scanned/image PDFs with no text layer can't be read this way — flag for OCR.

## Infrastructure CLI

**GitHub (`gh`)**
- Repo: `thomaskung/Binding` (renamed from `thomaskung/JumpOnBoard` 2026-08-03 — GitHub redirects the old URL, but use the new slug)
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
- Staging is gated by HTTP Basic Auth + `x-staging-auth` shared secret header (defense-in-depth).
  Set `STAGING_BASIC_AUTH` + `STAGING_SHARED_SECRET` env vars on Vercel to activate.
  No gate in local dev — middleware checks for these env vars before applying.
- Account deletion implemented at `/account` — cascading delete with points ledger sanitization
  (DESIGN.md §11). Tested nightly as functional test #15.
