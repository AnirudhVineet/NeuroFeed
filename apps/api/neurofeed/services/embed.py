"""Hugging Face Inference router client for BAAI/bge-small-en-v1.5.

HF deprecated the legacy `api-inference.huggingface.co` host in late 2025 in
favor of `router.huggingface.co/hf-inference/...`. Rather than hardcode the
new path (and chase the next rename), we use the `huggingface_hub` SDK,
which handles routing, retries, and cold-start waiting internally.

Model name and 384-dim output unchanged, so the pgvector schema,
match_chunks RPC, services/rag.py, and workers/jobs.py keep working with
no migration.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Iterable

from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError

from ..config import get_settings

log = logging.getLogger(__name__)

_MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_DIM = 384

_REQUEST_TIMEOUT_S = 60.0
_BATCH_SIZE = 32


@lru_cache
def _client() -> InferenceClient:
    key = get_settings().huggingface_api_key
    if not key:
        raise RuntimeError(
            "HUGGINGFACE_API_KEY not configured — set it in env to enable embeddings",
        )
    return InferenceClient(
        model=_MODEL_NAME,
        token=key,
        provider="hf-inference",
        timeout=_REQUEST_TIMEOUT_S,
    )


def embed_texts(texts: Iterable[str], batch_size: int = _BATCH_SIZE) -> list[list[float]]:
    """Encode a list of strings → list of 384-dim float vectors (pgvector friendly).

    For sentence-transformers models like bge-small, the feature-extraction
    pipeline returns one pooled sentence embedding per input."""
    items = list(texts)
    if not items:
        return []
    client = _client()
    out: list[list[float]] = []
    for start in range(0, len(items), batch_size):
        batch = items[start : start + batch_size]
        try:
            arr = client.feature_extraction(batch)
        except HfHubHTTPError as e:
            # Re-raise with a tighter message so the worker's error row is
            # actionable instead of dumping an HF stack trace into the UI.
            raise RuntimeError(f"HF embedding call failed: {e}") from e
        # feature_extraction returns numpy.ndarray; .tolist() handles shapes
        # (n, d) and (d,) consistently.
        if hasattr(arr, "tolist"):
            arr = arr.tolist()
        if arr and isinstance(arr[0], (int, float)):
            arr = [arr]
        for v in arr:
            out.append([float(x) for x in v])
    return out


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]
