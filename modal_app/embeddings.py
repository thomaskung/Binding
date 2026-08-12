"""Qwen3-Embedding-0.6B on Modal — 1024-dim embeddings for matching.
Small enough to serve cheaply (T4 or even CPU); scale-to-zero.

Endpoint (POST, JSON, Bearer auth):
  /embed  {"text": ...} -> {"embedding": [1024 floats]}

Deploy: modal deploy modal_app/embeddings.py
Deploy E2E variant: MODAL_E2E=1 modal deploy modal_app/embeddings.py
  - MODAL_E2E controls the app name (binding-embeddings-e2e) and scaledown
    (3600s for CI, vs 120s for production) so long CI runs never re-cold-start.
"""

import os

import modal
from fastapi import Header, HTTPException

MODEL_ID = "Qwen/Qwen3-Embedding-0.6B"

IS_E2E = os.environ.get("MODAL_E2E", "0") == "1"
APP_NAME = "binding-embeddings-e2e" if IS_E2E else "binding-embeddings"
SCALEDOWN_WINDOW = 3600 if IS_E2E else 120

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("sentence-transformers>=3", "fastapi[standard]")
)


@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=SCALEDOWN_WINDOW,
    # APAC region pin — same rationale as llm.py's Qwen class (embedding
    # input is redacted-but-candidate-derived text; keep it in-region).
    region="ap",
    secrets=[modal.Secret.from_name("binding-api-token")],
)
class Embedder:
    @modal.enter()
    def load(self):
        from sentence_transformers import SentenceTransformer

        # truncate_dim=1024 matches the pgvector column (vector(1024)).
        self.model = SentenceTransformer(MODEL_ID, truncate_dim=1024)

    @modal.fastapi_endpoint(method="POST")
    def embed(self, body: dict, authorization: str = Header(default="")):
        # authorization MUST be bound via Header(...) — a bare `str = ""` is a
        # FastAPI *query* param, so header-based Bearer auth silently 401s.
        expected = os.environ.get("MODAL_API_TOKEN", "")
        if not expected or authorization != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="bad token")

        vector = self.model.encode(body["text"], normalize_embeddings=True)
        return {"embedding": vector.tolist()}
