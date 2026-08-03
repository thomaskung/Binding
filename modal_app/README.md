# modal_app — Private LLM stack (Qwen3 on Modal)

Self-hosted open-weight models serving all candidate-derived AI work. This is
the **private path** required by the DESIGN.md frontier-API rule: resume text,
redacted profiles, skill vectors, and match context never leave infrastructure
we control.

## Models

| Job | Model | Endpoint |
|---|---|---|
| Redaction, fit summaries, refinement | Qwen/Qwen3-8B-AWQ (vLLM, L4) | `/redact`, `/fit_summary`, `/refine` |
| Embeddings (1024-dim, matches `vector(1024)` columns) | Qwen/Qwen3-Embedding-0.6B (T4) | `/embed` |

Model choices re-verified against mid-2026 leaderboards (MEMORY.md entry);
re-check before major version bumps, not just at design time.

## Deploy

```bash
pip install modal
modal setup                      # authenticate (Starter plan: $30/mo included credit)
modal secret create binding-api-token MODAL_API_TOKEN=<generate a long random string>
modal deploy modal_app/embeddings.py
modal deploy modal_app/llm.py
```

Copy the printed endpoint URLs plus the token into the Next.js env
(`.env.local` / Vercel environment variables):

```
AI_PROVIDER=modal
MODAL_REDACT_URL=...
MODAL_SUMMARY_URL=...
MODAL_REFINE_URL=...
MODAL_EMBED_URL=...
MODAL_API_TOKEN=...
```

## Credit-budget guardrails ($30/mo Starter credit)

- Both apps **scale to zero** (`scaledown_window=120`); idle cost is zero.
- Cold start is seconds — acceptable for publish/reveal flows, which are
  explicit user actions, not hot paths.
- One AI pass per **explicit publish** (profile or job), never per keystroke —
  enforced app-side.
- Check the Modal usage dashboard **weekly** during beta. If burn trends past
  ~$25/mo: batch embeds, cap refine calls per user per day, or drop the LLM to
  a smaller Qwen3 variant.
- Local dev and CI never call Modal (`AI_PROVIDER=stub`).
