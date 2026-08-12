# modal_app — Private LLM stack (Qwen3 on Modal)

Self-hosted open-weight models serving all candidate-derived AI work. This is
the **private path** required by the DESIGN.md frontier-API rule: resume text,
redacted profiles, skill vectors, and match context never leave infrastructure
we control.

## Models

Three source files; each deploys BOTH a production app (scaledown 120s) and an
E2E app (scaledown 3600s) via the `MODAL_E2E` env var:

| Job | Model | GPU | Prod app | E2E app |
|---|---|---|---|---|
| Redaction, credentials generalization | Qwen/Qwen3-0.6B (vLLM, T4) | T4 | `binding-llm-small` | `binding-llm-small-e2e` |
| Fit summaries, extraction, refinement | Qwen/Qwen3-1.7B (vLLM, T4) | T4 | `binding-llm` | `binding-llm-e2e` |
| Embeddings (1024-dim, matches `vector(1024)` columns) | Qwen/Qwen3-Embedding-0.6B (T4) | T4 | `binding-embeddings` | `binding-embeddings-e2e` |

The split exists so each model can be sized / fine-tuned independently:
redact + credentials are high-frequency, low-quality-sensitivity (both have
deterministic fallbacks), so they run on the cheap 0.6B; fit-summary / extract
/ refine need the 1.7B for recruiter-facing prose and structured JSON.

The E2E apps keep `scaledown_window=3600` so long CI suites (which run
serially across ~40 minutes) never re-cold-start mid-run. Production stays at
120s. `modal.ts` routes CI traffic to the E2E apps via the `e2e_modal=1`
cookie; human QA on staging hits production Modal.

Model choices re-verified against mid-2026 leaderboards (MEMORY.md entry);
re-check before major version bumps, not just at design time.

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
# E2E variants (scaledown 3600s) — deployed by CI; optional to run by hand:
MODAL_E2E=1 modal deploy modal_app/llm-small.py
MODAL_E2E=1 modal deploy modal_app/llm.py
MODAL_E2E=1 modal deploy modal_app/embeddings.py
```

Copy the printed endpoint URLs plus the token into the Next.js env
(`.env.local` / Vercel environment variables). The production URLs go in the
`MODAL_*_URL` vars; the E2E URLs go in the `E2E_MODAL_*_URL` vars:

```
AI_PROVIDER=modal
MODAL_REDACT_URL=...         # binding-llm-small      /redact
MODAL_CREDENTIALS_URL=...    # binding-llm-small      /refine (credentials only)
MODAL_EXTRACT_URL=...        # binding-llm            /extract
MODAL_SUMMARY_URL=...        # binding-llm            /fit-summary
MODAL_REFINE_URL=...         # binding-llm            /refine (profile/jd/career)
MODAL_EMBED_URL=...          # binding-embeddings     /embed
MODAL_API_TOKEN=...
E2E_MODAL_REDACT_URL=...     # binding-llm-small-e2e  (CI only)
E2E_MODAL_CREDENTIALS_URL=...
E2E_MODAL_EXTRACT_URL=...
E2E_MODAL_SUMMARY_URL=...
E2E_MODAL_REFINE_URL=...
E2E_MODAL_EMBED_URL=...
```

## Credit-budget guardrails ($30/mo Starter credit)

- All apps **scale to zero**; idle cost is zero. Production at 120s, E2E at
  3600s (CI-only, so the long window never touches real traffic).
- Cold start is tens of seconds (up to ~100s on T4) — acceptable for
  publish/reveal flows, which are explicit user actions, not hot paths.
- One AI pass per **explicit publish** (profile or job), never per keystroke —
  enforced app-side.
- The E2E apps are only active during CI runs (nightly ~40 min + post-merge
  smoke ~10 min), so their idle cost is near-zero. The keep-warm ping loops
  were retired when the E2E apps' 3600s scaledown made them unnecessary —
  CI no longer burns GPU time keeping production containers alive.
- Check the Modal usage dashboard **weekly** during beta. If burn trends past
  ~$25/mo: batch embeds, cap refine calls per user per day, or drop an
  operation to a smaller model variant.
- Local dev and CI never call Modal (`AI_PROVIDER=stub`).
