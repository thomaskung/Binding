"""Qwen3 0.6B on Modal serverless GPU — the CHEAP small-model app for
credentials generalization only. Deliberately DECOUPLED from llm.py so each
model can be fine-tuned / sized independently (see the cost-reduction plan).

Why credentials-only here: redaction moved back to the 1.7B medium app
(llm.py) because the 0.6B returned resumes near-verbatim (weak date/school/
scale generalization) — the founder-resume test requires better redaction
quality. Credentials generalization is a short summarization with a
deterministic floor fallback (src/lib/credentials.ts), so the 0.6B is plenty.

Endpoint (POST, JSON, Bearer auth via MODAL_API_TOKEN secret):
  /refine  {"text": ..., "kind": "credentials"}   -> {"refined": ...}
           kind != "credentials" -> 400 (this app only handles credentials)

Deploy: modal deploy modal_app/llm-small.py
"""

import os

import modal
from fastapi import Header, HTTPException

MODEL_ID = "Qwen/Qwen3-0.6B"

app = modal.App("binding-llm-small")


def _download_model():
    # Bake the weights into the image at BUILD time so a cold container starts
    # from local disk instead of downloading at cold start.
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_ID)


image = (
    modal.Image.debian_slim(python_version="3.12")
    # Pin vllm to 0.10.x: newer releases (>=0.11) dropped the V0 engine, and
    # the V1 engine crashes on this GPU class during startup KV-cache profiling
    # (_dummy_sampler_run -> topk_topp_sampler.forward_cuda) — confirmed in the
    # Aug 2026 redeploy (vllm 0.27.1, "Engine core initialization failed" on
    # T4). 0.10.x honors VLLM_USE_V1=0 and its V0 engine skips that path.
    # transformers<5: vllm 0.10.x crashes on transformers>=5 ("Qwen2Tokenizer has
    # no attribute all_special_tokens_extended" — the get_cached_tokenizer path).
    .pip_install("vllm==0.10.2", "transformers<5", "fastapi[standard]", "huggingface_hub[hf_transfer]")
    # VLLM_USE_V1=0: force the V0 engine (the V1 default crashes at startup on
    # this GPU class). V0 loads faster and is far more robust in this container.
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "VLLM_USE_V1": "0"})
    .run_function(_download_model)
)

CREDENTIALS_SYSTEM = """You generalize a candidate's credentials (awards,
certifications, patents, publications) into a SHORT, de-identified summary for
a recruiter — enough to signal strength, never enough to identify the person.
RULES:
- Keep the category and rough count/scale: "patent-holder", "2 patents",
  "cloud-certified", "industry award winner", "published author".
- REMOVE every specific: patent numbers, exact award names/titles, years,
  issuing body names, URLs, employer names, any proper noun that fingerprints.
- Never invent credentials the input doesn't state.
- Output ONE line, categories separated by " · ", no commentary.
Example: "Patent US10,123,456 for a fraud-detection graph algorithm; AWS SA
Pro; won FinTech HK 2023 Innovator award" -> "patent-holder (fraud detection) ·
cloud-certified · industry award winner" /no_think"""


@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=120,
    # APAC region pin (DESIGN.md §5/§12, 2026-07-28): raw resume text is
    # redacted here, so processing runs in-region rather than Modal's
    # implicit US default (~1.5x broad-region price multiplier accepted).
    # Interim posture until the HK edge-layer migration (DESIGN.md §2f);
    # cross-border safeguards (DPA) still apply — LEGAL_REVIEW.md Q16.
    region="ap",
    secrets=[modal.Secret.from_name("binding-api-token")],
)
class QwenSmall:
    @modal.enter()
    def load(self):
        from vllm import LLM

        # enforce_eager skips CUDA-graph capture — meaningfully faster cold
        # start (a bit slower per-token, fine at demo volume).
        self.llm = LLM(model=MODEL_ID, max_model_len=8192, enforce_eager=True)

    def _generate(self, system: str, user: str) -> str:
        from vllm import SamplingParams

        conversation = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        params = SamplingParams(temperature=0.2, max_tokens=2048)
        outputs = self.llm.chat(conversation, params)
        text = outputs[0].outputs[0].text
        # Qwen3 emits an (often empty) <think>…</think> block even with
        # /no_think — strip it so callers get clean redaction/summary text.
        import re

        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        return text.strip()

    @modal.fastapi_endpoint(method="POST")
    def refine(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        # This app ONLY serves credentials generalization. Rejecting everything
        # else makes a config-swap (credentials URL pointed at the 1.7B app or
        # vice versa) fail loudly instead of silently using the wrong model.
        if body.get("kind") != "credentials":
            raise HTTPException(status_code=400, detail="this endpoint only handles credentials")
        return {"refined": self._generate(CREDENTIALS_SYSTEM, body["text"])}


def _auth(authorization: str) -> None:
    expected = os.environ.get("MODAL_API_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="bad token")
