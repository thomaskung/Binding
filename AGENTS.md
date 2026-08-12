# AGENTS.md

## Secrets Policy

- **All secrets live in `.env.local` only** — never in code, config files, documentation, or commit history.
- `.env.local` is gitignored and must never be staged. If a secret is detected in a tracked file, rotate it immediately.
- Repo-wide secrets are stored as GitHub Actions encrypted secrets (`gh secret set`), referenced via `${{ secrets.SECRET_NAME }}`.
- When documenting commands that require secrets, use placeholder names like `<supabase-role-key>`, never paste real values.
- The staging E2E command below is an example; real secrets come from `.env.local` or GH Actions secrets.

## Dev Setup

- `pnpm install` (pnpm 11.5.2 — `corepack enable` first if missing)
- **No local Supabase, no Docker** (retired 2026-08-06). `pnpm dev` runs against the **hosted** Supabase project
- Keys go in `.env.local` — copy `.env.example` and fill from the Supabase dashboard (Settings → API)
- Sign in via magic link, or set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` locally for the password tab
- `pnpm dev` shares the hosted staging data — destructive experiments are not sandboxed; `pnpm seed:staging` restores the dataset
- Codespace at `.devcontainer/` pre-installs pnpm, Supabase CLI, Modal CLI, Vercel CLI

## Testing

- Unit tests: `pnpm test` (vitest, `tests/*.test.ts`, Node env)
- Single file: `pnpm test -- tests/matching.test.ts`
- E2E: `pnpm e2e` — runs against **deployed staging** (no local mode). Needs the `E2E_*` secrets in `.env.local` (`playwright.config.ts` fails fast listing any missing); serial (1 worker). Specs create their own per-run users via the service-role key — no seeded logins. Also gates every PR in `ci.yml`
- E2E cost: publish/reveal/extract/refine are **real Modal calls** on staging. Wrap them in `countAiCall()`; `AI_CALL_BUDGET` (`e2e/staging-helpers.ts`) is enforced in teardown
- Staging E2E (password login + basic auth required, secrets from `.env.local`):
  ```
  E2E_BASE_URL=https://binding-staging.vercel.app \
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
- Staging URL: `https://binding-staging.vercel.app`

**Modal**
- Auth: `modal token set --token-id <ID> --token-secret <SECRET>` (values from `.env.local` comment; profile `thomaskung`)
- API secret: `modal secret create binding-api-token MODAL_API_TOKEN=<value>`
- Deploy (3 apps × production + E2E variants; `MODAL_E2E=1` flips app name + `scaledown_window` 120→3600):
  `modal deploy modal_app/llm-small.py` + `modal deploy modal_app/llm.py` + `modal deploy modal_app/embeddings.py` (+ same three with `MODAL_E2E=1` for CI)
- Endpoint URLs printed on deploy; set as Vercel env vars for `AI_PROVIDER=modal` (production `MODAL_*_URL` + E2E `E2E_MODAL_*_URL` — see `modal_app/README.md`)
- vLLM pins: `vllm==0.10.2` + `transformers<5` (V0 engine only — looser pins crash on T4)

**Supabase** (hosted only — no local stack)
- Hosted project ref: `qjqaeuzpsefawqwlfwlf` (region `ap-southeast-1`)
- Link remote: `supabase login` or `SUPABASE_ACCESS_TOKEN` → `supabase link --project-ref qjqaeuzpsefawqwlfwlf`
- Without link, push via pooler:
  `supabase db push --db-url "postgresql://postgres.<ref>:<DB_PW>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"`
  DB_PW in `.env.local`; URL-encode `%` as `%25` if present in password

## Gotchas & Conventions

- `@binding/ui` is a pnpm workspace package shipped as raw TS source — needs `transpilePackages` in next.config
- New DB tables: add `GRANT` statements to `0002_rls.sql` or Supabase returns 42501
- Seeded `auth.users` rows: token columns must be `''` not `NULL` (GoTrue 500s)
- Routing is path-segment only — NO query params (founder rule)
- `127.0.0.1` and `localhost` are different origins to browsers; `allowedDevOrigins` set in next.config
- Privacy invariant: candidate-derived data never reaches frontier APIs — enforced by `JDTextOnly` branded type + `tests/frontier-guardrail.test.ts`
- AI defaults to `stub` (deterministic, zero cost, no network). Switch to `modal` only after Modal endpoints are deployed
- Migrations: **don't edit applied ones in place** — add a forward migration. `db push` only applies pending migrations against the live DB, so it can't prove a from-zero build and won't flag an edited migration that already ran. Verify schema-bearing changes against a **scratch** database (`supabase db push --db-url <scratch>`) before merge; keep version prefixes unique
- TS pinned to 5.x, ESLint pinned to 9 — upgrading breaks eslint-config-next
- Strategy docs (BUSINESS/DESIGN/VISION/LEGAL_REVIEW) are versioned — bump version, update date, add history row on material edits
- Staging: `main` branch = Vercel deploy, Supabase hosted, Modal AI. Codespace for dev.
- Staging is gated by HTTP Basic Auth + `x-staging-auth` shared secret header (defense-in-depth).
  Set `STAGING_BASIC_AUTH` + `STAGING_SHARED_SECRET` env vars on Vercel to activate.
  No gate in local dev — middleware checks for these env vars before applying.
- Account deletion implemented at `/account` — cascading delete with points ledger sanitization
  (DESIGN.md §11). Tested nightly as functional test #15.

## Design & UI control via MCP (Claude Code ↔ Claude Design)

Claude Code can **control and update** both the design surfaces. Two MCP servers cover it, plus a
browser one for driving the live app. Reference:
https://support.claude.com/en/articles/14604416-get-started-with-claude-design

### 1. Claude Design MCP — the "Binding UI" project + design system
- **What it controls**: the claude.ai/design project **"Binding UI"** (`projectId dc871eb6-…`, the
  authoritative mockup source per CLAUDE.md) and the `@binding/ui` design-system kit.
- **Connect it (once, user scope)** — makes it available in your own terminal going forward:
  ```
  claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
  ```
  then `/design-login` to authenticate. Prereq: a Pro/Max/Team plan. (In a Claude Code session that
  already exposes the DesignSync tool, the MCP is effectively connected for that session already.)
- **Bidirectional round-trip**:
  - **Code → Design**: `/design-sync` pushes the local `packages/ui` component kit **up** to the
    "Binding UI" project so Claude Design builds start from the real components (one component at a
    time; it does NOT carry app *screens*). See `.design-sync/NOTES.md` for the kit-sync mechanics
    and gotchas (PKG_DIR-relative paths, 11-of-38 component scope, re-grade on `pkg`/`globalName` change).
  - **Design → Code**: from Claude Design, "Handoff to Claude Code" ("Send to local coding agent" /
    "Send to Claude Code Web") continues from existing work instead of starting from a screenshot.
- **Namespace ground truth (IMPORTANT)**: `.design-sync/config.json` is authoritative —
  `globalName:"BindingUI"`, `pkg:"@binding/ui"`. The live design-project bundle + `.dc.html`
  templates still bind the OLD `window.JumpOnBoardUI`; the next `/design-sync` regenerates the bundle
  as `BindingUI` and will require updating every template `JumpOnBoardUI.*`→`BindingUI.*` in the same
  pass (a `globalName` change = full component re-grade). Do that migration **atomically** — kit
  re-sync + rename-all-templates together — or the project is left half-migrated and broken.
  (`NOTES.md`'s 2026-08-03 "identifiers stay JumpOnBoard on purpose" paragraph is stale — see MEMORY.md 2026-08-05.)
- **Limitations** (per the support article): multi-person simultaneous editing is unreliable; import
  quality is only as good as the source (a messy kit produces a messy design system).

### 2. Browser control of the running app — `claude-in-chrome` MCP
Drives a real Chrome tab to navigate/click/fill/screenshot/record. Two targets:
- **Local**: `pnpm dev` (against hosted Supabase — no local stack to start). Use for
  fast iteration and demos of unshipped work.
- **Vercel staging**: the deployed `main` build. Staging is gated by HTTP Basic Auth +
  `x-staging-auth` shared secret — supply `STAGING_BASIC_AUTH` (browser httpCredentials) and the
  `x-staging-auth` header (from `.env.local` / GH Actions secrets) so the browser reaches it without
  tripping the gate. Use for testing the real deployed UI.
