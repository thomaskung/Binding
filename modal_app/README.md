# modal_app — Private LLM stack (Qwen3 on Modal)

Self-hosted open-weight models serving all candidate-derived AI work. This is
the **private path** required by the DESIGN.md frontier-API rule: resume text,
redacted profiles, skill vectors, and match context never leave infrastructure
we control.

## Models

Two production apps, all `scaledown_window=120s`:

| Job | Model | Compute | App |
|---|---|---|---|
| Redaction, fit summaries, extraction, refinement, credentials generalization | Qwen/Qwen3-1.7B (vLLM, T4) | T4 | `binding-llm` |
| Embeddings (1024-dim, matches `vector(1024)` columns) | Qwen/Qwen3-Embedding-0.6B | CPU | `binding-embeddings` |

Redaction runs on the 1.7B because the 0.6B returned resumes near-verbatim
(weak date/school/scale generalization) — the founder-resume test needs better
redaction quality. Credentials generalization was merged onto the 1.7B from
the retired `binding-llm-small` (0.6B) app on 2026-08-18: a second T4
container (with its own cold-start tail) cost more than the 0.6B token
savings, and the deterministic floor fallback (`src/lib/credentials.ts`)
remains the leak guarantee regardless of model size.

Embeddings run CPU-only (also since 2026-08-18): a 0.6B embedder never needed
a T4 — the GPU was ~$20/mo for ~1KB encodes, and a CPU cold start (~seconds)
beats a T4 boot (~20-100s). Same weights/`truncate_dim=1024`; stored vectors
may drift cosine by ~1e-4, far below match thresholds.

There are **no separate E2E Modal apps**. The E2E suite runs in parallel
(`workers: 4`, ~10 min vs ~40 min serial), so the production apps' 120s
scaledown keeps containers warm naturally across the run — every worker hits
Modal every few seconds, so no endpoint idles long enough to cool down. CI
warms the endpoints once before the suite (curl + Playwright globalSetup), then
parallel test calls keep them up. E2E tolerates the occasional mid-suite cold
start via generous test timeouts (global 180s + per-test 180-480s budgets),
not keep-warm pings.

Model choices re-verified against mid-2026 leaderboards (MEMORY.md entry);
re-check before major version bumps, not just at design time.

### Model testing suite (spike)

Adversarial re-validation of the generation model lives in `SPIKE.md` + the
`spike.py` harness (2026-08-13). Verdict: **keep Qwen3-1.7B** — Qwen3-4B and
Qwen3.5-2B (latest vLLM/V1) were both slower and worse at founder-résumé
redaction. `enforce_eager=False` (CUDA graphs) gave no throughput win; vLLM
request batching under concurrency is the real lever (~3.5× on 4 redacts).

## vLLM version pins (do not loosen)

- `vllm==0.10.2` — the V0 engine. Newer releases (`>=0.11`) dropped V0 and
  their V1 engine crashes on this GPU class at startup (`Engine core
  initialization failed`, KV-cache profiling), and `VLLM_USE_V1=0` becomes an
  unknown env var. Confirmed in the Aug 2026 redeploy (vllm 0.27.1 on T4).
- `transformers<5` — vllm 0.10.x's `get_cached_tokenizer` crashes on
  transformers>=5 (`Qwen2Tokenizer has no attribute all_special_tokens_extended`).
- `VLLM_USE_V1=0` + `enforce_eager=True` — force V0, skip CUDA-graph capture
  for fast cold start (~20-100s on T4, within Modal's ~151s sync window).

## Deploy

```bash
pip install modal
modal setup                      # authenticate (Starter plan: $30/mo included credit)
modal secret create binding-api-token MODAL_API_TOKEN=<generate a long random string>
modal deploy modal_app/llm.py
modal deploy modal_app/embeddings.py
```

Copy the printed endpoint URLs plus the token into the Next.js env
(`.env.local` / Vercel environment variables):

```
AI_PROVIDER=modal
MODAL_REDACT_URL=...         # binding-llm          /redact
MODAL_CREDENTIALS_URL=...    # binding-llm          /refine (kind=credentials)
MODAL_EXTRACT_URL=...        # binding-llm          /extract
MODAL_SUMMARY_URL=...        # binding-llm          /fit-summary
MODAL_REFINE_URL=...         # binding-llm          /refine (profile/jd/career/company)
MODAL_EMBED_URL=...          # binding-embeddings   /embed (CPU)
MODAL_API_TOKEN=...
```

Note: `MODAL_CREDENTIALS_URL` and `MODAL_REFINE_URL` point at the same
`binding-llm` `/refine` URL (since the 0.6B merge, 2026-08-18) — the endpoint
dispatches on `kind`. Keeping two env vars avoids a larger refactor; they may
be collapsed later.

## Credit-budget guardrails ($30/mo Starter credit)

- All apps **scale to zero** (`scaledown_window=120`); idle cost is zero.
- Cold start is tens of seconds (up to ~100s on T4) — acceptable for
  publish/reveal flows, which are explicit user actions, not hot paths.
- One AI pass per **explicit publish** (profile or job), never per keystroke —
  enforced app-side.
- The CI keep-warm ping loops were retired. E2E runs in parallel (~10 min) so
  the 120s scaledown keeps production containers warm naturally — CI no longer
  burns GPU time keeping containers alive, and there are no E2E variant apps.
- **Automated budget alarm** (since 2026-08-18): `.github/workflows/
  modal-budget.yml` runs daily and warns at $20 / hard-fails at $28 of
  month-to-date METERED cost (pre-credit — billed only turns positive after
  the credit is gone, too late to act). An August 2026 overrun hit $80 metered
  / $50 billed before a manual check caught it; the alarm closes that gap.
- If burn trends past ~$25/mo: batch embeds, cap refine calls per user per
  day, or drop an operation to a smaller model variant.
- Local dev and CI never call Modal (`AI_PROVIDER=stub`).
