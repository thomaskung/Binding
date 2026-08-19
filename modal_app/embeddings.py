"""Qwen3-Embedding-0.6B on Modal — 1024-dim embeddings for matching.

CPU-only since 2026-08-18: a 0.6B embedder never needed a T4 — the GPU cost
was ~$20/mo for ~1KB encodes (see modal_app/README.md cost review), and a CPU
cold start (~seconds) beats a T4 boot (~20-100s). Output is identical to the
old GPU path (same weights, truncate_dim=1024); stored vectors may drift
cosine by ~1e-4, far below match thresholds.

Endpoint (POST, JSON, Bearer auth):
  /embed  {"text": ...} -> {"embedding": [1024 floats]}

Deploy: modal deploy modal_app/embeddings.py
"""

import os

import modal
from fastapi import Header, HTTPException

MODEL_ID = "Qwen/Qwen3-Embedding-0.6B"

app = modal.App("binding-embeddings")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("sentence-transformers>=3", "fastapi[standard]")
)


@app.cls(
    image=image,
    # CPU-only (was T4): a 0.6B embedding model doesn't need a GPU — the T4
    # was ~$20/mo for a ~1KB encode (README.md cost review, 2026-08-18). CPU
    # cold start is also much faster than a T4 boot (~seconds vs 20-100s).
    memory=4096,
    scaledown_window=120,
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
