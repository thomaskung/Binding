"""Qwen3 8B on Modal serverless GPU — private LLM path for all
candidate-derived text (DESIGN.md privacy rule: this data never reaches a
frontier API).

Endpoints (POST, JSON, Bearer auth via MODAL_API_TOKEN secret):
  /redact       {"text": ...}                          -> {"redactedText": ...}
  /fit-summary  {"candidate": ..., "job": ...}         -> {"summary": ...}
  /refine       {"text": ..., "kind": "profile"|"job_description"} -> {"refined": ...}

Deploy: modal deploy modal_app/llm.py
Budget: scale-to-zero; a single L4 handles Qwen3-8B AWQ. At MVP volume
(hundreds of calls/day) this stays comfortably inside the $30/mo Starter
credit. Watch the Modal dashboard weekly; see modal_app/README.md.
"""

import os

import modal

MODEL_ID = "Qwen/Qwen3-8B-AWQ"

app = modal.App("jumponboard-llm")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("vllm>=0.9", "fastapi[standard]")
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

REFINE_JD_SYSTEM = """You improve a job description for semantic matching
against candidate profiles: clear responsibilities, concrete required skills,
standard terminology, no fluff. Do NOT add requirements that aren't implied.
Output only the improved text. /no_think"""


@app.cls(
    image=image,
    gpu="L4",
    scaledown_window=120,  # scale to zero quickly — credit guardrail
    secrets=[modal.Secret.from_name("jumponboard-api-token")],
)
class Qwen:
    @modal.enter()
    def load(self):
        from vllm import LLM

        self.llm = LLM(model=MODEL_ID, max_model_len=8192)

    def _generate(self, system: str, user: str) -> str:
        from vllm import SamplingParams

        conversation = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        params = SamplingParams(temperature=0.2, max_tokens=2048)
        outputs = self.llm.chat(conversation, params)
        return outputs[0].outputs[0].text.strip()

    @modal.fastapi_endpoint(method="POST")
    def redact(self, body: dict, authorization: str = ""):
        _auth(authorization)
        return {"redactedText": self._generate(REDACT_SYSTEM, body["text"])}

    @modal.fastapi_endpoint(method="POST")
    def fit_summary(self, body: dict, authorization: str = ""):
        _auth(authorization)
        user = f"CANDIDATE (redacted):\n{body['candidate']}\n\nROLE:\n{body['job']}"
        return {"summary": self._generate(SUMMARY_SYSTEM, user)}

    @modal.fastapi_endpoint(method="POST")
    def refine(self, body: dict, authorization: str = ""):
        _auth(authorization)
        system = REFINE_JD_SYSTEM if body.get("kind") == "job_description" else REFINE_PROFILE_SYSTEM
        return {"refined": self._generate(system, body["text"])}


def _auth(authorization: str) -> None:
    from fastapi import HTTPException

    expected = os.environ.get("MODAL_API_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="bad token")
