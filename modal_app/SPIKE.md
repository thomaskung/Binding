# Model Spike — lightweight LLM selection suite (2026-08-13)

Adversarial comparison of candidate generation models for Binding's private
Modal stack, measured with the **founder-résumé test**: boot reliability,
throughput under the real contention shape, and redaction quality against the
founder's actual identifiers.

## Outcome (TL;DR)

**Keep `Qwen/Qwen3-1.7B` on T4 with the production config.** Neither candidate
beat it: both were slower *and* worse at redaction. Two surrounding findings:

1. **CUDA graphs (`enforce_eager=False`) are not a throughput lever.** Single
   redact tok/s was flat-to-slightly-worse on both GPUs. The real win is vLLM's
   request **batching**: 4 concurrent redacts on 1.7B/T4 finish in ~30s total
   (~163 tok/s aggregate) vs ~92s serial — ~3.5×.
2. **Raw-LLM redaction is stochastic at 1.7B.** Same model/config passed on T4
   (0 leaks) and leaked 10 identifiers on L4. The deterministic
   `redact-known.ts` floor remains the PII guarantee; the LLM pass is a
   generalization nicety, not a backstop.
3. **Qwen3.5-2B (latest vLLM/V1) requires heavy surgery and still underperforms.**
   V1 needs a CUDA-devel image (FlashInfer JIT-builds its sampler with nvcc),
   `attention_config.backend="TRITON_ATTN"` (FlashInfer `BatchPrefill` returns
   "invalid argument" on T4/sm_75), and `enforce_eager=True` (CUDA-graph capture
   crashes on T4). Boot landed at 221s (L4) / 609s (T4) — far over Modal's ~151s
   sync window. Redaction was worse: heavy `[Redacted]` over-redaction,
   truncation at the 2048-token cap, and a leaked link.

## Result table

| # | Candidate | GPU | Boot | Single redact | 4-batch (contention) | Redact quality |
|---|---|---|---|---|---|---|
| 0 | **Qwen3-1.7B** (current), vllm 0.10.2 V0, `enforce_eager=False` | T4 | 102.8s | 23.0s @ **45.9** tok/s (1058) | 29.6s @ **163** tok/s | ✅ 0 leaks, clean generalization |
| 0 | same | L4 | 55.5s | 23.7s @ 52.7 tok/s (1251) | 26.1s @ 192.7 tok/s | ❌ 10 leaks (name×2, 6 employers, link, school) |
| 1 | Qwen3-4B, vllm 0.10.2 V0, `enforce_eager=False` | T4 | 107.9s | 51.4s @ 23.8 tok/s (1223) | 58.8s @ 83.4 tok/s | ❌ full name left verbatim |
| 1 | same | L4 | 56.3s | 46.4s @ 26.4 tok/s (1223) | 50.3s @ 97.6 tok/s | ❌ full name left verbatim |
| 2 | Qwen3.5-2B, vllm 0.22.1 V1, `TRITON_ATTN`, `enforce_eager=True` | T4 | **609.4s** | 107.4s @ 19.1 tok/s (2048=cap) | 71.6s @ 74.3 tok/s | ❌ over-redact, truncation, link leak |
| 2 | same | L4 | 221.2s | 77.7s @ 26.4 tok/s (2048=cap) | 69.0s @ 88.0 tok/s | ❌ same |

All configs: `max_model_len=8192`, `max_tokens=2048`, `temperature=0.2`,
`max_model_len` same as production. Extract (6 experiences parsed) and
fit-summary (2–3 sentences) passed for every candidate that booted.

## How to run

```bash
node scripts/build-founder-resume.mjs          # → test-data/.founder-resume.txt (gitignored)
modal run modal_app/spike.py::spike_v0_t4 --model Qwen/Qwen3-1.7B --resume "$(cat test-data/.founder-resume.txt)"
modal run modal_app/spike.py::spike_v0_l4 --model Qwen/Qwen3-4B      --resume "$(cat test-data/.founder-resume.txt)"
modal run modal_app/spike.py::spike_v1_t4 --model Qwen/Qwen3.5-2B   --resume "$(cat test-data/.founder-resume.txt)"
modal run modal_app/spike.py::spike_v1_debug                         # toolchain check for the V1 image
```

Each run prints one JSON line: `boot_ok/boot_s`, `single_redact_s/single_out_tokens/
single_tok_s`, `batch4_s/batch4_tok_s`, `leaks/quality_redact_pass`,
`extract_ok/extract_experience_count`, `summary_sentences`, plus
`redacted_sample` / `summary_sample` for eyeballing.

## Files

- `modal_app/spike.py` — harness. Two images (V0 production stack; V1 latest
  vLLM on a CUDA-devel base) × two GPUs (T4/L4) plus a toolchain diagnostic.
  Weights cache in the `binding-hf-cache` Modal volume.
- `scripts/build-founder-resume.mjs` — builds the ~1,500-token synthetic
  founder stand-in from the real identifiers already committed in
  `tests/redact-known.test.ts` (name, 6 employers, HK address) plus fully
  synthetic contact/school/education content. Writes the gitignored
  `test-data/.founder-resume.txt`.

## Gotchas captured (for future spikes)

- Modal resolves functions by module attribute name — **no lambdas** as
  `app.function` targets (`module 'spike' has no attribute '<lambda>'`).
- vllm 0.22.1 (V1) reads **no `VLLM_ATTENTION_BACKEND` env var**; the override
  is config-only via `attention_config={"backend": "TRITON_ATTN"}`.
- V1 + FlashInfer JIT-compiles its sampler with nvcc at cold start → the image
  needs a CUDA-devel base matching torch's CUDA (torch 2.11.0+cu130 → CUDA 13.0).
- L4 is not meaningfully faster for 1.7B decode (52.7 vs 45.9 tok/s) at ~35%
  higher GPU cost — not worth it at demo volume.
