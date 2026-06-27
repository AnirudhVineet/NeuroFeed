"""Hugging Face Inference API client for BAAI/bge-small-en-v1.5.

Replaces the previous local fastembed runtime. The 130 MB ONNX model and
~100 MB ONNX runtime are no longer loaded into the API process, which keeps
the Render web instance under its 512 MB cap even during ingestion of long
documents.

The model name, output dimensionality, and call signature are unchanged so
the rest of the codebase (pgvector schema, match_chunks RPC, services/rag.py,
workers/jobs.py) keeps working with no migration.
"""
from __future__ import annotations

import logging
import time
from typing import Iterable

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

_MODEL_NAME = "BAAI/bge-small-en-v1.5"
_HF_URL = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{_MODEL_NAME}"
EMBED_DIM = 384

# HF "cold start" can take 20-30s on first request after the model has been
# idle. wait_for_model=true tells the server to hold the connection open
# until the model is warm; we still cap our own retries so a flaky upstream
# doesn't hang an upload forever.
_REQUEST_TIMEOUT_S = 60.0
_MAX_RETRIES = 3
_BATCH_SIZE = 32


def _hf_key() -> str:
    key = get_settings().huggingface_api_key
    if not key:
        raise RuntimeError(
            "HUGGINGFACE_API_KEY not configured — set it in env to enable embeddings",
        )
    return key


def embed_texts(texts: Iterable[str], batch_size: int = _BATCH_SIZE) -> list[list[float]]:
    """Encode a list of strings → list of 384-dim float vectors (pgvector friendly).

    For sentence-transformers models like bge-small, HF's feature-extraction
    pipeline returns one pooled sentence embedding per input, so the result
    shape is list[list[float]] with len == len(inputs)."""
    items = list(texts)
    if not items:
        return []
    headers = {
        "Authorization": f"Bearer {_hf_key()}",
        "Content-Type": "application/json",
    }
    out: list[list[float]] = []
    with httpx.Client(timeout=_REQUEST_TIMEOUT_S) as client:
        for start in range(0, len(items), batch_size):
            batch = items[start : start + batch_size]
            vecs = _post_with_retry(client, headers, batch)
            for v in vecs:
                out.append([float(x) for x in v])
    return out


def embed_one(text: str) -> list[float]:
    return embed_texts([text])[0]


def _post_with_retry(
    client: httpx.Client,
    headers: dict[str, str],
    inputs: list[str],
) -> list[list[float]]:
    payload = {
        "inputs": inputs,
        "options": {"wait_for_model": True, "use_cache": True},
    }
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            res = client.post(_HF_URL, headers=headers, json=payload)
            if res.status_code == 503:
                body = (
                    res.json()
                    if res.headers.get("content-type", "").startswith("application/json")
                    else {}
                )
                wait = float(body.get("estimated_time", 5.0))
                log.info("HF model warming (attempt %d, waiting %.1fs)", attempt + 1, wait)
                time.sleep(min(wait, 20.0))
                continue
            res.raise_for_status()
            data = res.json()
            # Single-input requests can come back as list[float] depending on
            # the route — normalize so the caller always gets list[list[float]].
            if data and isinstance(data, list) and isinstance(data[0], (int, float)):
                return [data]  # type: ignore[list-item]
            return data
        except Exception as e:
            last_exc = e
            log.warning("HF embed call failed (attempt %d): %s", attempt + 1, e)
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(
        f"HF Inference API failed after {_MAX_RETRIES} attempts: {last_exc}",
    )
