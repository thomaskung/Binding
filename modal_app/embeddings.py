"""Qwen3-Embedding-0.6B on Modal — 1024-dim embeddings for matching.
Small enough to serve cheaply (T4 or even CPU); scale-to-zero.

Endpoint (POST, JSON, Bearer auth):
  /embed  {"text": ...} -> {"embedding": [1024 floats]}

Deploy: modal deploy modal_app/embeddings.py
"""

import os

import modal

MODEL_ID = "Qwen/Qwen3-Embedding-0.6B"

app = modal.App("jumponboard-embeddings")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("sentence-transformers>=3", "fastapi[standard]")
)


@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=120,
    secrets=[modal.Secret.from_name("jumponboard-api-token")],
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
            raise HTTPException(status_code=401, detail="bad token")

        vector = self.model.encode(body["text"], normalize_embeddings=True)
        return {"embedding": vector.tolist()}
