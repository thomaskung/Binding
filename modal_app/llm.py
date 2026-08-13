"""Qwen3 1.7B on Modal serverless GPU — the MEDIUM generation app for
recruiter-facing and structured-output operations (redact / fit-summary /
extract / non-credentials refine). Redaction lives here on the 1.7B because
the 0.6B small app returned resumes near-verbatim (weak date/school/scale
generalization) — the founder-resume test needs better redaction quality.
Only credentials generalization stays on the 0.6B small app (llm-small.py,
deterministic-floor fallback). All candidate-derived text stays on this private
path (DESIGN.md privacy rule: this data never reaches a frontier API).

Endpoints (POST, JSON, Bearer auth via MODAL_API_TOKEN secret):
  /redact       {"text": ...}                          -> {"redactedText": ...}
  /fit-summary  {"candidate": ..., "job": ...}         -> {"summary": ...}
  /refine       {"text": ..., "kind": "profile"|"job_description"|"career_assist"} -> {"refined": ...}
  /extract      {"text": ...}                          -> {"skills":[], "roles":[], "industries":[], "experience":[]}

Deploy: modal deploy modal_app/llm.py
Budget: scale-to-zero; T4 handles Qwen3-1.7B comfortably. At MVP volume
(hundreds of calls/day) this stays comfortably inside the $30/mo Starter
credit. Watch the Modal dashboard weekly; see modal_app/README.md.
"""

import os

import modal
from fastapi import Header, HTTPException

# Qwen3-1.7B (was Qwen3-8B-AWQ): the 8B couldn't load within Modal's ~151s
# sync web-endpoint window on an L4, so cold calls always 303'd. The 1.7B
# loads in well under the window → reliable on-demand, no keep-warm cost.
# This is the MEDIUM generation model (redact / fit-summary / extract /
# non-credentials refine) — redaction moved back here (2026-08-12) because
# the 0.6B redaction was near-verbatim; only credentials stayed on the small
# app. Matching quality is unaffected (separate Qwen3-Embedding).
MODEL_ID = "Qwen/Qwen3-1.7B"

app = modal.App("binding-llm")


def _download_model():
    # Bake the weights into the image at BUILD time so a cold container starts
    # from local disk instead of downloading ~5GB — the download was the bulk
    # of the >150s cold start that overran Modal's sync web-endpoint window.
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_ID)


image = (
    modal.Image.debian_slim(python_version="3.12")
    # Pin vllm to 0.10.x: newer releases (>=0.11) dropped the V0 engine, and
    # the V1 engine crashes on this GPU class during startup KV-cache profiling
    # (_dummy_sampler_run -> topk_topp_sampler.forward_cuda) — confirmed in the
    # Aug 2026 redeploy (vllm 0.27.1, "Engine core initialization failed" on
    # T4). 0.10.x honors VLLM_USE_V1=0 and its V0 engine skips that path.
    # transformers<5: vllm 0.10.x crashes on transformers>=5 ("Qwen2Tokenizer
    # has no attribute all_special_tokens_extended" — get_cached_tokenizer).
    .pip_install("vllm==0.10.2", "transformers<5", "fastapi[standard]", "huggingface_hub[hf_transfer]")
    # VLLM_USE_V1=0: force the V0 engine (the V1 default crashes at startup on
    # this GPU class). V0 loads faster and is far more robust in this container.
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "VLLM_USE_V1": "0"})
    .run_function(_download_model)
)

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

REFINE_PROFILE_SYSTEM = """You improve a candidate's pseudonymized profile text
for semantic matching against job descriptions: clearer skill statements,
concrete achievements, standard terminology. Do NOT add facts. Do NOT add
identifying details. Output only the improved text. /no_think"""

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

REFINE_JD_SYSTEM = """You improve a job description for semantic matching
against candidate profiles: clear responsibilities, concrete required skills,
standard terminology, no fluff. Do NOT add requirements that aren't implied.
Output only the improved text. /no_think"""

CAREER_ASSIST_SYSTEM = """You are a career assistant helping job seekers with
resume rewriting, cover letters, interview prep, and career-path guidance. Be
concise and practical. Do NOT ask for or reference specific employer names,
personal contact details, or other identifying information. /no_think"""


@app.cls(
    image=image,
    gpu="T4",
    # scaledown_window=300: keep a container alive 5 min after its last request
    # so it survives the E2E warm-up -> first-real-call gap without paying a long
    # production tail. History: 120s let the container cool during a test's
    # onboarding-UI lead-in and the ~100s T4 cold start blew the 90s waits
    # (2026-08-12); 300s fixed that. Then 600s was added (2026-08-13) as a
    # stopgap for a warm-up SKEW — the 3 containers were cold-started serially,
    # so the first-warmed one cooled while the rest were still warming. That skew
    # is fixed at the source by parallel warm-up (e2e/global-setup.ts Promise.all
    # + the CI curl `wait`), so 600s is unnecessary and 300s is restored as the
    # tight, correct value. The parallel suite (~12 min) keeps containers warm
    # between specs; sparse demo traffic scales to zero regardless.
    scaledown_window=300,
    # APAC region pin (DESIGN.md §5/§12, 2026-07-28): raw resume text is
    # redacted here, so processing runs in-region rather than Modal's
    # implicit US default (~1.5x broad-region price multiplier accepted).
    # Interim posture until the HK edge-layer migration (DESIGN.md §2f);
    # cross-border safeguards (DPA) still apply — LEGAL_REVIEW.md Q16.
    region="ap",
    secrets=[modal.Secret.from_name("binding-api-token")],
)
class Qwen:
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
    def redact(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        return {"redactedText": self._generate(REDACT_SYSTEM, body["text"])}

    @modal.fastapi_endpoint(method="POST")
    def fit_summary(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        user = f"CANDIDATE (redacted):\n{body['candidate']}\n\nROLE:\n{body['job']}"
        return {"summary": self._generate(SUMMARY_SYSTEM, user)}

    @modal.fastapi_endpoint(method="POST")
    def refine(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        kind = body.get("kind")
        # Credentials generalization moved to llm-small.py (0.6B). Rejecting it
        # here makes a config-swap fail loudly instead of silently paying for
        # the 1.7B on a task the small model should handle.
        if kind == "credentials":
            raise HTTPException(status_code=400, detail="credentials handled by binding-llm-small")
        if kind == "job_description":
            system = REFINE_JD_SYSTEM
        elif kind == "career_assist":
            system = CAREER_ASSIST_SYSTEM
        else:
            system = REFINE_PROFILE_SYSTEM
        return {"refined": self._generate(system, body["text"])}

    @modal.fastapi_endpoint(method="POST")
    def extract(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        import json
        raw = self._generate(EXTRACT_SYSTEM, body["text"])
        # The model may wrap JSON in markdown fences or extra text.
        start = raw.index("{")
        end = raw.rindex("}") + 1
        return json.loads(raw[start:end])


def _auth(authorization: str) -> None:
    expected = os.environ.get("MODAL_API_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="bad token")
