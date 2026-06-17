"""fastembed wrapper for BAAI/bge-small-en-v1.5 (384-dim, CPU, free).

Model is loaded lazily on first call and cached for the process lifetime.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Iterable

_MODEL_NAME = "BAAI/bge-small-en-v1.5"
EMBED_DIM = 384


@lru_cache
def _model():
    from fastembed import TextEmbedding
    return TextEmbedding(model_name=_MODEL_NAME)


def embed_texts(texts: Iterable[str], batch_size: int = 32) -> list[list[float]]:
    """Encode a batch of strings → list of 384-dim float lists (pgvector friendly)."""
    model = _model()
    out: list[list[float]] = []
    for vec in model.embed(list(texts), batch_size=batch_size):
        out.append([float(x) for x in vec])
    return out


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]
