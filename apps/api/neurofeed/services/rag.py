"""RAG: embed the question, retrieve top-k chunks via Supabase RPC, return confidence."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..deps import get_supabase_admin
from .embed import embed_one


@dataclass
class RetrievedChunk:
    chunk_id: int
    document_id: str
    ord: int
    text: str
    page_ref: dict
    similarity: float


# Below this similarity, we won't trust the result.
CONFIDENCE_FLOOR = 0.30


def retrieve(
    *,
    user_id: str,
    question: str,
    top_k: int = 5,
    document_id: str | None = None,
) -> tuple[list[RetrievedChunk], float]:
    """Return (chunks, max_similarity). Caller treats max_sim < CONFIDENCE_FLOOR as low confidence."""
    sb = get_supabase_admin()
    if sb is None:
        raise RuntimeError("Supabase admin client not configured")

    vec = embed_one(question)
    params: dict[str, Any] = {
        "query_embedding": vec,
        "match_user_id": user_id,
        "match_count": top_k,
        "match_doc_id": document_id,
    }
    res = sb.rpc("match_chunks", params).execute()
    rows = getattr(res, "data", None) or []
    chunks = [
        RetrievedChunk(
            chunk_id=int(r["chunk_id"]),
            document_id=str(r["document_id"]),
            ord=int(r["ord"]),
            text=str(r["text"]),
            page_ref=r.get("page_ref") or {},
            similarity=float(r["similarity"]),
        )
        for r in rows
    ]
    max_sim = max((c.similarity for c in chunks), default=0.0)
    return chunks, max_sim
