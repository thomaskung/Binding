# modal_app — Private LLM stack (Qwen3 on Modal)

Self-hosted open-weight models serving all candidate-derived AI work. This is
the **private path** required by the DESIGN.md frontier-API rule: resume text,
redacted profiles, skill vectors, and match context never leave infrastructure
we control.

## Models

Three production apps, all `scaledown_window=120s`:

| Job | Model | GPU | App |
|---|---|---|---|
| Redaction, fit summaries, extraction, refinement | Qwen/Qwen3-1.7B (vLLM, T4) | T4 | `binding-llm` |
| Credentials generalization | Qwen/Qwen3-0.6B (vLLM, T4) | T4 | `binding-llm-small` |
| Embeddings (1024-dim, matches `vector(1024)` columns) | Qwen/Qwen3-Embedding-0.6B (T4) | T4 | `binding-embeddings` |

Redaction runs on the 1.7B because the 0.6B returned resumes near-verbatim
(weak date/school/scale generalization) — the founder-resume test needs better
redaction quality. Credentials generalization runs on the cheap 0.6B: it is a
short summarization with a deterministic floor fallback
(`src/lib/credentials.ts`), so a weak model can never leak a specific.

There are **no separate E2E Modal apps**. The E2E suite runs in parallel
(`workers: 4`, ~10 min vs ~40 min serial), so the production apps' 120s
scaledown keeps containers warm naturally across the run — every worker hits
Modal every few seconds, so no endpoint idles long enough to cool down. CI
warms the endpoints once before the suite (curl + Playwright globalSetup), then
parallel test calls keep them up.

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
modal deploy modal_app/llm-small.py
modal deploy modal_app/llm.py
modal deploy modal_app/embeddings.py
```

Copy the printed endpoint URLs plus the token into the Next.js env
(`.env.local` / Vercel environment variables):

```
AI_PROVIDER=modal
MODAL_REDACT_URL=...         # binding-llm            /redact
MODAL_CREDENTIALS_URL=...    # binding-llm-small      /refine (credentials only)
MODAL_EXTRACT_URL=...        # binding-llm            /extract
MODAL_SUMMARY_URL=...        # binding-llm            /fit-summary
MODAL_REFINE_URL=...         # binding-llm            /refine (profile/jd/career)
MODAL_EMBED_URL=...          # binding-embeddings     /embed
MODAL_API_TOKEN=...
```

## Credit-budget guardrails ($30/mo Starter credit)

- All apps **scale to zero** (`scaledown_window=120`); idle cost is zero.
- Cold start is tens of seconds (up to ~100s on T4) — acceptable for
  publish/reveal flows, which are explicit user actions, not hot paths.
- One AI pass per **explicit publish** (profile or job), never per keystroke —
  enforced app-side.
- The CI keep-warm ping loops were retired. E2E runs in parallel (~10 min) so
  the 120s scaledown keeps production containers warm naturally — CI no longer
  burns GPU time keeping containers alive, and there are no E2E variant apps.
- Check the Modal usage dashboard **weekly** during beta. If burn trends past
  ~$25/mo: batch embeds, cap refine calls per user per day, or drop an
  operation to a smaller model variant.
- Local dev and CI never call Modal (`AI_PROVIDER=stub`).
