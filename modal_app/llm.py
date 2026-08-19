"""Qwen3 1.7B on Modal serverless GPU — the MEDIUM generation app for
recruiter-facing and structured-output operations (redact / fit-summary /
extract / refine, including credentials generalization since 2026-08-18).
Redaction lives here on the 1.7B because the 0.6B small app returned resumes
near-verbatim (weak date/school/scale generalization) — the founder-resume
test needs better redaction quality. Credentials generalization was merged
back onto the 1.7B from the retired binding-llm-small app: a second T4
container (with its own cold-start tail) cost more than the 0.6B token
savings, and the deterministic floor (src/lib/credentials.ts) remains the
leak guarantee. All candidate-derived text stays on this private path
(DESIGN.md privacy rule: this data never reaches a frontier API).

Endpoints (POST, JSON, Bearer auth via MODAL_API_TOKEN secret):
  /redact       {"text": ...}                          -> {"redactedText": ...}
  /fit-summary  {"candidate": ..., "job": ...}         -> {"summary": ...}
  /refine       {"text": ..., "kind": "profile"|"job_description"|"career_assist"|"credentials"|"company_research"} -> {"refined": ...}
  /extract      {"text": ...}                          -> {"skills":[], "roles":[], "industries":[], "experience":[]}
                {"text": ..., "kind": "job_extract"}   -> {"title","department","skills":[],"responsibilities":[],"requirements":[],"description"}
                {"text": ..., "kind": "job_generate"}  -> same shape as job_extract, drafted from a short prompt
                (kind absent/unrecognized -> resume extraction, unchanged)

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

JOB_EXTRACT_SYSTEM = """You extract structured job-posting fields from a
recruiter-pasted external job description. Return ONLY valid JSON matching
this schema, no commentary, no markdown:
{
  "title": "job title",
  "department": "team or department name, or null",
  "skills": ["skill1", "skill2"],
  "responsibilities": ["responsibility1", "responsibility2"],
  "requirements": ["requirement1", "requirement2"],
  "description": "a short paragraph describing the role"
}
Extract only what the source text actually supports. Never invent a skill,
responsibility, requirement, or department the text doesn't mention. Use
null for department if the text doesn't state one. /no_think"""

JOB_GENERATE_SYSTEM = """You draft a full job posting from a short recruiter
prompt (role, team, and/or location cues). Return ONLY valid JSON matching
this schema, no commentary, no markdown:
{
  "title": "job title",
  "department": "team or department name, or null",
  "skills": ["skill1", "skill2"],
  "responsibilities": ["responsibility1", "responsibility2"],
  "requirements": ["requirement1", "requirement2"],
  "description": "a short paragraph describing the role"
}
This is a first draft for the recruiter to review and edit — write plausible,
generic content appropriate to the prompt. Do NOT state specific salary
numbers, benefits, or company facts the prompt didn't give you. /no_think"""

CAREER_ASSIST_SYSTEM = """You are a career assistant helping job seekers with
resume rewriting, cover letters, interview prep, and career-path guidance. Be
concise and practical. Do NOT ask for or reference specific employer names,
personal contact details, or other identifying information. /no_think"""

ASSESSMENT_GRADE_SYSTEM = """You grade a candidate's open-ended answer to a
skill-assessment question against a recruiter/founder-reviewed rubric. Return
ONLY valid JSON matching this schema, no commentary, no markdown:
{
  "passed": true or false,
  "rationale": "one or two sentences explaining the pass/fail decision"
}
Grade strictly against the rubric's stated bar — do not pass an answer that
doesn't meet it out of politeness, and do not fail a correct answer for
stylistic reasons the rubric doesn't mention. /no_think"""

SCREENING_QUESTIONS_SYSTEM = """You draft candidate-facing screening
questions and their grading rubrics from a recruiter's own job-posting text.
Return ONLY valid JSON matching this schema, no commentary, no markdown:
{
  "questions": [
    {"question": "an open-ended question for the candidate to answer", "rubric": "what a passing answer must demonstrate"}
  ]
}
Generate 2-4 questions. Each question must probe something the job text
actually asks for (a named skill, responsibility, or requirement) — never
invent a requirement the text doesn't support. Each rubric states a concrete,
checkable bar for what a passing answer needs to demonstrate, not a vague
"good answer" description. /no_think"""

COMPANY_RESEARCH_SYSTEM = """You summarize public information about an
employer for a job candidate deciding whether to apply, using ONLY the
search-result snippets provided — never your own background knowledge about
the company, which may be outdated or wrong. If the snippets don't support a
claim, leave it out rather than filling in from what you already "know."
Cover culture, recent news, and reputation where the snippets support it.
2-4 short paragraphs, plain text, no markdown, no commentary about your
process. If the snippets are too sparse to say anything substantive, say so
plainly instead of padding with generic filler. /no_think"""


@app.cls(
    image=image,
    gpu="T4",
    # scaledown_window=120: keep a container alive 2 min after its last request.
    # History: 300s (2026-08-12) existed only to cover an E2E warm-up ->
    # first-real-call gap; that gap is now absorbed by generous test timeouts
    # (global 180s + per-test 180-480s budgets, see e2e/), so the shorter tail
    # is safe and halves idle spend. 600s was already dropped (2026-08-13) once
    # the warm-up skew was fixed at source (e2e/global-setup.ts Promise.all +
    # CI curl `wait`). The parallel suite (~12 min) keeps the container warm
    # between specs; sparse demo traffic scales to zero regardless.
    scaledown_window=120,
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
        # Credentials generalization was merged here from the retired
        # binding-llm-small app (2026-08-18): the 0.6B's second T4 container
        # cost more than its token savings. The deterministic floor in
        # src/lib/credentials.ts is still the leak guarantee.
        if kind == "credentials":
            system = CREDENTIALS_SYSTEM
        elif kind == "job_description":
            system = REFINE_JD_SYSTEM
        elif kind == "career_assist":
            system = CAREER_ASSIST_SYSTEM
        elif kind == "company_research":
            system = COMPANY_RESEARCH_SYSTEM
        else:
            system = REFINE_PROFILE_SYSTEM
        user = body["text"]
        if kind == "company_research":
            user = f"COMPANY: {body.get('company', '')}\n\nSEARCH RESULTS:\n{body['text']}"
        return {"refined": self._generate(system, user)}

    @modal.fastapi_endpoint(method="POST")
    def extract(self, body: dict, authorization: str = Header(default="")):
        _auth(authorization)
        import json

        kind = body.get("kind")
        if kind == "job_extract":
            system = JOB_EXTRACT_SYSTEM
        elif kind == "job_generate":
            system = JOB_GENERATE_SYSTEM
        elif kind == "assessment_grade":
            system = ASSESSMENT_GRADE_SYSTEM
        elif kind == "screening_questions":
            system = SCREENING_QUESTIONS_SYSTEM
        else:
            system = EXTRACT_SYSTEM
        # assessment_grade needs two inputs (rubric + candidate answer) —
        # every other kind here takes a single text blob, so this stays a
        # kind-specific branch rather than a new top-level field everyone
        # else has to ignore.
        user = body["text"]
        if kind == "assessment_grade":
            user = f"RUBRIC:\n{body.get('context', '')}\n\nCANDIDATE ANSWER:\n{body['text']}"
        raw = self._generate(system, user)
        # The model may wrap JSON in markdown fences or extra text.
        try:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            return json.loads(raw[start:end])
        except (ValueError, json.JSONDecodeError):
            # job_extract/job_generate ask the model to emit a full job
            # posting as JSON (nested arrays, free-form description) — a
            # harder generation task for this model size than resume
            # extraction, and more prone to omitting braces entirely or
            # truncating mid-object at the 2048-token cap. Degrade to an
            # empty draft (the TS-side normalizeJobDraft in modal.ts fills in
            # the rest) rather than a 500 — the recruiter sees "nothing
            # extracted", not a crash. assessment_grade fails CLOSED
            # (not passed) rather than empty, matching the TS-side
            # gradeAssessmentAttempt normalize's fail-closed discipline — a
            # malformed grading response must never silently grant a pass.
            # The plain resume-extraction path (kind absent) keeps its
            # original behavior: a malformed response there is unexpected
            # enough to raise loudly instead.
            if kind in ("job_extract", "job_generate"):
                return {}
            if kind == "screening_questions":
                return {"questions": []}
            if kind == "assessment_grade":
                return {"passed": False, "rationale": "grading failed — malformed model response"}
            raise


def _auth(authorization: str) -> None:
    expected = os.environ.get("MODAL_API_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="bad token")
