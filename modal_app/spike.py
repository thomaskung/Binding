"""Ephemeral Model Spike harness — boot / throughput / quality checks for
candidate generation models on Modal (T4 / L4).

Run one candidate per invocation via `modal run`:

  # candidate 0: current model, CUDA graphs ON (the cheap-throughput lever)
  modal run modal_app/spike.py::spike_v0_t4 --model Qwen/Qwen3-1.7B --resume "$(cat test-data/.founder-resume.txt)"

  # candidate 1: Qwen3-4B on the production V0 stack
  modal run modal_app/spike.py::spike_v0_l4 --model Qwen/Qwen3-4B --resume "$(cat test-data/.founder-resume.txt)"

  # candidate 2: Qwen3.5-2B on latest vLLM (V1 engine), language-model-only
  modal run modal_app/spike.py::spike_v1_t4 --model Qwen/Qwen3.5-2B --resume "$(cat test-data/.founder-resume.txt)"

Checks per run:
  1. boot  — time to construct vLLM.LLM (the V1 crash gate).
  2. single redact — wall time + output tok/s (tokenizer-counted).
  3. 4-batch redact — the production contention shape (4 concurrent redacts).
  4. quality — PII-leak scan on the redact output (name/employers/address/
     email/phone/school), extract JSON shape, fit-summary sentence count.

Weights are cached in the `binding-hf-cache` Modal volume so repeated cold
starts (T4 then L4, reruns) do not re-download.
"""

import json
import os
import re
import time

import modal

app = modal.App("binding-llm-spike")
hf_cache = modal.Volume.from_name("binding-hf-cache", create_if_missing=True)

REDACT_SYSTEM = """You redact resumes for a privacy-first hiring platform.
Rewrite the resume text with ALL of the following removed or generalized:
- names, emails, phone numbers, addresses, links
- current/previous employer names (replace with e.g. "[a regional bank]")
- school names (replace with e.g. "[a Hong Kong university]")
- exact years/dates (generalize: "8 years experience", "[YEAR]")
- any detail that could identify the person in a small talent pool
Keep ALL skills, achievements (with scale generalized), and seniority signals.
Output only the redacted text, no commentary. /no_think"""

SUMMARY_SYSTEM = """You summarize candidate-role fit for a recruiter in 2-3
sentences. Be concrete about overlapping skills and gaps. Never invent facts
not present in the inputs. Output only the summary. /no_think"""

EXTRACT_SYSTEM = """You extract structured fields from a resume. Return ONLY
valid JSON matching this schema, no commentary, no markdown:
{
  "skills": ["skill1", "skill2"],
  "roles": ["most recent title", "previous title"],
  "industries": ["industry1"],
  "experience": [
    {
      "role": "title",
      "company": "company name",
      "industry": "industry or null",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null for present"
    }
  ]
}
Extract skills, job titles, industries, and work history exactly as written.
Never fabricate. Use null for missing dates or industry. /no_think"""

# Real identifiers from tests/redact-known.test.ts + the synthetic stand-in
# extras from scripts/build-founder-resume.mjs. Each must NOT survive redaction.
LEAKS = [
    (r"KUNG", "name"),
    (r"Siu Kei", "name"),
    (r"Thomas", "name"),
    (r"Rakkar", "employer"),
    (r"Crypto\.com", "employer"),
    (r"Protiviti", "employer"),
    (r"PCCW", "employer"),
    (r"Macroview", "employer"),
    (r"T\s*[&\uFF06]\s*S\b", "employer"),
    (r"Hoi Fai", "address"),
    (r"Tai Kok Tsui", "address"),
    (r"Island Harbourview", "address"),
    (r"example\.com", "email"),
    (r"5555", "phone"),
    (r"linkedin", "link"),
    (r"University of Science and Technology", "school"),
]

FIT_JD = (
    "Head of Security Operations at a digital-asset custody startup. "
    "Requires ISO 27001 / SOC 2 experience, incident response leadership, "
    "and vendor risk management. Hong Kong based."
)


def _make_image(vllm_spec, env):
    return (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install(*vllm_spec, "fastapi[standard]", "huggingface_hub[hf_transfer]")
        .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/root/.cache/huggingface", **env})
    )


# V0 path — mirrors production binding-llm (llm.py): pinned vllm 0.10.2 with the
# V0 engine forced (V1 crashes on this GPU class during KV-cache profiling).
image_v0 = _make_image(
    ["vllm==0.10.2", "transformers<5"],
    {"VLLM_USE_V1": "0"},
)

# V1 path — latest vLLM, V1 engine default (required for Qwen3.5). Built on a
# CUDA-devel base because V1 uses FlashInfer for top-p/top-k sampling, which
# JIT-compiles its kernel with nvcc at cold start; the slim image has no CUDA
# toolkit and dies with "Could not find nvcc" (confirmed on both T4 and L4).
# Devel base must match torch's CUDA (2.11.0+cu130 -> CUDA 13.0).
image_v1 = (
    modal.Image.from_registry("nvidia/cuda:13.0.0-devel-ubuntu24.04", add_python="3.12")
    .apt_install("build-essential", "ninja-build")
    .pip_install("vllm", "fastapi[standard]", "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/root/.cache/huggingface"})
)


def _strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _run_spike(model, resume, enforce_eager, with_language_model_only, attention_backend=None):
    results = {"model": model, "enforce_eager": enforce_eager,
               "with_language_model_only": with_language_model_only,
               "attention_backend": attention_backend,
               "resume_chars": len(resume)}

    from vllm import LLM, SamplingParams

    t0 = time.monotonic()
    kwargs = dict(model=model, max_model_len=8192, enforce_eager=enforce_eager)
    if with_language_model_only:
        kwargs["language_model_only"] = True
    if attention_backend:
        kwargs["attention_config"] = {"backend": attention_backend}
    try:
        llm = LLM(**kwargs)
    except Exception as exc:  # boot gate: the V1 crash shows up here
        results["boot_ok"] = False
        results["boot_fail"] = f"{type(exc).__name__}: {exc}"
        print(json.dumps(results))
        return results
    results["boot_ok"] = True
    results["boot_s"] = round(time.monotonic() - t0, 1)

    tokenizer = llm.get_tokenizer()
    params = SamplingParams(temperature=0.2, max_tokens=2048)

    def _chat(system, user):
        conv = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        return _strip_think(llm.chat(conv, params)[0].outputs[0].text)

    def _tokens(text):
        return len(tokenizer.encode(text))

    # 1) single redact
    t0 = time.monotonic()
    redacted = _chat(REDACT_SYSTEM, resume)
    single_s = time.monotonic() - t0
    out_tokens = _tokens(redacted)
    results["single_redact_s"] = round(single_s, 1)
    results["single_out_tokens"] = out_tokens
    results["single_tok_s"] = round(out_tokens / single_s, 1)
    results["redacted_sample"] = redacted[:600]

    # 2) 4-batch redact (production contention shape)
    convs = [[{"role": "system", "content": REDACT_SYSTEM}, {"role": "user", "content": resume}]
             for _ in range(4)]
    t0 = time.monotonic()
    batch = llm.chat(convs, params)
    batch_s = time.monotonic() - t0
    batch_tokens = sum(_tokens(o.outputs[0].text) for o in batch)
    results["batch4_s"] = round(batch_s, 1)
    results["batch4_tokens"] = batch_tokens
    results["batch4_tok_s"] = round(batch_tokens / batch_s, 1)

    # 3) quality: PII leak scan on the raw LLM redact output
    leaks = [label for rx, label in LEAKS if re.search(rx, redacted, re.I)]
    results["leaks"] = leaks
    results["quality_redact_pass"] = not leaks

    # 4) quality: extract JSON shape
    try:
        raw = _chat(EXTRACT_SYSTEM, resume)
        start, end = raw.index("{"), raw.rindex("}") + 1
        data = json.loads(raw[start:end])
        shape_ok = (
            all(k in data for k in ("skills", "roles", "industries", "experience"))
            and isinstance(data.get("experience"), list)
            and len(data["experience"]) >= 4
        )
        results["extract_ok"] = shape_ok
        results["extract_experience_count"] = len(data.get("experience", []))
        results["extract_roles"] = data.get("roles", [])[:4]
    except Exception as exc:
        results["extract_ok"] = False
        results["extract_fail"] = f"{type(exc).__name__}: {exc}"

    # 5) quality: fit-summary sentence count
    summary = _chat(SUMMARY_SYSTEM, f"CANDIDATE (redacted):\n{redacted}\n\nROLE:\n{FIT_JD}")
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", summary) if s]
    results["summary_sentences"] = len(sentences)
    results["summary_sample"] = summary[:300]

    print(json.dumps(results))
    return results


def _function(name, image, gpu):
    return app.function(
        image=image,
        gpu=gpu,
        region="ap",
        timeout=1800,
        volumes={"/root/.cache/huggingface": hf_cache},
        name=name,
    )


def _spike_v0(model, resume, enforce_eager=False):
    # V0 candidates (production stack): Qwen3-1.7B (candidate 0) and Qwen3-4B
    # (candidate 1). enforce_eager=False enables CUDA graphs (the cheap lever).
    return _run_spike(model, resume, enforce_eager, with_language_model_only=False)


def _spike_v1(model, resume):
    # V1 candidates (latest vLLM): Qwen3.5-2B (candidate 2), language-model-only.
    # enforce_eager=True: skips CUDA-graph capture (V1's capture crashes on T4).
    # attention_config backend=TRITON_ATTN: FlashInfer's BatchPrefill (head_dim
    # 256) returns "invalid argument" on T4/sm_75 during the profiling run; the
    # Triton backend is the fallback vLLM lists on T4. (0.22.1 reads no
    # VLLM_ATTENTION_BACKEND env var — the override is config-only.)
    return _run_spike(model, resume, True, with_language_model_only=True,
                      attention_backend="TRITON_ATTN")


def _v1_debug():
    import os
    import subprocess

    import flashinfer
    import torch
    import vllm

    # Diagnostic: report the resolved toolchain in the V1 image (handy when
    # upgrading vllm — e.g. the nvcc/FlashInfer JIT requirement depends on it).
    print(json.dumps({
        "torch": torch.__version__,
        "torch_cuda": torch.version.cuda,
        "vllm": vllm.__version__,
        "flashinfer": getattr(flashinfer, "__version__", "unknown"),
        "nvcc_on_path": subprocess.run(["which", "nvcc"], capture_output=True, text=True).returncode == 0,
        "cuda_home_exists": os.path.exists("/usr/local/cuda"),
    }))


# Modal resolves functions by their module attribute name (getattr(module,
# qual_name)) — a lambda has no stable name, so these must be named defs.
spike_v0_t4 = _function("spike_v0_t4", image_v0, "T4")(_spike_v0)
spike_v0_l4 = _function("spike_v0_l4", image_v0, "L4")(_spike_v0)
spike_v1_t4 = _function("spike_v1_t4", image_v1, "T4")(_spike_v1)
spike_v1_l4 = _function("spike_v1_l4", image_v1, "L4")(_spike_v1)
spike_v1_debug = _function("spike_v1_debug", image_v1, "L4")(_v1_debug)
