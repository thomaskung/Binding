"""Qwen3-Embedding-0.6B on Modal — 1024-dim embeddings for matching.
Small enough to serve cheaply (T4 or even CPU); scale-to-zero.

Endpoint (POST, JSON, Bearer auth):
  /embed  {"text": ...} -> {"embedding": [1024 floats]}

Deploy: modal deploy modal_app/embeddings.py
"""

import os

import modal

MODEL_ID = "Qwen/Qwen3-Embedding-0.6B"

app = modal.App("binding-embeddings")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("sentence-transformers>=3", "fastapi[standard]")
)


@app.cls(
    image=image,
    gpu="T4",
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
    def embed(self, body: dict, authorization: str = ""):
        from fastapi import HTTPException

        expected = os.environ.get("MODAL_API_TOKEN", "")
        if not expected or authorization != f"Bearer {expected}":
            import hashlib

            fp = hashlib.sha256(expected.encode()).hexdigest()[:12] if expected else "EMPTY"
            raise HTTPException(status_code=401, detail=f"bad token; expected_len={len(expected)} expected_sha12={fp}")

        vector = self.model.encode(body["text"], normalize_embeddings=True)
        return {"embedding": vector.tolist()}
